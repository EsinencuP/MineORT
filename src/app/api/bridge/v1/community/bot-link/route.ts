import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { confirmGameBotLink } from "@/lib/community/bot";
import { notificationsEnabled } from "@/lib/community/notifications";
import { communityPlayer } from "@/lib/community/player";

export async function POST(req: NextRequest) {
  if (!notificationsEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: { player_uuid?: unknown; code?: unknown } | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const player = await communityPlayer(input?.player_uuid);
  if (
    !player ||
    typeof input?.code !== "string" ||
    !(await confirmGameBotLink(player.userId, input.code))
  )
    return bridgeJson({ error: "ERR_BOT_CODE_INVALID" }, 400);
  return bridgeJson({ result: "connected" });
}
