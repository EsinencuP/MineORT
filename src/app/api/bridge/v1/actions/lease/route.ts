import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { leaseActions } from "@/lib/bridge/queue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  let max = 10;
  try {
    const body = raw ? JSON.parse(raw) : {};
    if (Number.isInteger(body.max)) max = Math.max(1, Math.min(20, body.max));
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  if (auth.server.status === "paused")
    return bridgeJson({ actions: [], paused: true });
  const actions = await leaseActions(auth.serverId, max);
  return bridgeJson({ actions, paused: false });
}
