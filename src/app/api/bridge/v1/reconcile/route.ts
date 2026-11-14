import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { reconcile } from "@/lib/bridge/whitelist";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  let entries: { nickname: string; uuid?: string | null }[];
  try {
    const body = JSON.parse(raw);
    if (!Array.isArray(body.entries) || body.entries.length > 5000)
      throw new Error("entries");
    entries = body.entries.map((e: { nickname?: unknown; uuid?: unknown }) => {
      if (
        typeof e.nickname !== "string" ||
        !/^[A-Za-z0-9_]{1,16}$/.test(e.nickname)
      )
        throw new Error("nickname");
      return {
        nickname: e.nickname,
        uuid: typeof e.uuid === "string" ? e.uuid : null,
      };
    });
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  if (auth.server.status === "paused")
    return bridgeJson({ error: "ERR_SERVER_PAUSED" }, 423);

  return bridgeJson({ ok: true, ...(await reconcile(auth.serverId, entries)) });
}
