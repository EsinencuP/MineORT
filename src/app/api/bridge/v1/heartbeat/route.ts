import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 64) =>
  typeof v === "string" ? v.slice(0, max) : null;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  // heartbeat stays available to an outdated Bridge so the admin can see why it is rejected
  const auth = await authenticateBridge(req, raw, "general", {
    allowOutdated: true,
  });
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  // A heartbeat never lifts a pause: only an admin action does.
  const paused = auth.server.status === "paused";
  const { error } = await db()
    .from("bridge_servers")
    .update({
      status: paused ? "paused" : "online",
      last_heartbeat_at: new Date().toISOString(),
      bridge_version: str(body.bridge_version),
      server_version: str(body.server_version),
      journal_epoch:
        typeof body.journal_epoch === "string" ? body.journal_epoch : null,
    })
    .eq("id", auth.serverId);
  if (error) throw new Error(`heartbeat update: ${error.message}`);

  return bridgeJson({
    ok: true,
    min_bridge_version: auth.server.min_bridge_version,
    paused,
  });
}
