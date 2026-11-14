import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set([
  "player.join",
  "player.quit",
  "auth.failed",
  "security.violation",
  "marker.create_requested", // accepted now, consumed in P1c
]);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  let events: unknown;
  try {
    events = JSON.parse(raw).events;
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  const results: {
    event_id: unknown;
    result: "accepted" | "duplicate" | "rejected";
    code?: string;
  }[] = [];
  for (const e of events as Record<string, unknown>[]) {
    const { event_id, type, occurred_at, ...payload } = e ?? {};
    const when =
      typeof occurred_at === "string" ? Date.parse(occurred_at) : NaN;
    if (
      typeof event_id !== "string" ||
      !UUID.test(event_id) ||
      typeof type !== "string" ||
      !TYPES.has(type) ||
      Number.isNaN(when)
    ) {
      results.push({ event_id, result: "rejected", code: "ERR_BAD_EVENT" });
      continue;
    }
    // idempotent by (server_id, event_id): a repeat is reported, never stored twice
    const { error } = await db()
      .from("server_events")
      .insert({
        server_id: auth.serverId,
        event_id,
        type,
        payload,
        occurred_at: new Date(when).toISOString(),
      });
    if (!error) results.push({ event_id, result: "accepted" });
    else if (error.code === "23505")
      results.push({ event_id, result: "duplicate" });
    else throw new Error(`server_events insert: ${error.message}`);
  }
  return bridgeJson({ results });
}
