import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { communityPlayer } from "@/lib/community/player";
import { sendSms, smsEnabled } from "@/lib/community/sms";
import { SocialError } from "@/lib/social/errors";

export async function POST(req: NextRequest) {
  if (!smsEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: {
    player_uuid?: unknown;
    to?: unknown;
    text?: unknown;
    operation_id?: unknown;
  } | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const sender = await communityPlayer(input?.player_uuid);
  if (!sender) return bridgeJson({ error: "ERR_PLAYER_NOT_FOUND" }, 404);
  try {
    const id = await sendSms(
      sender.userId,
      input?.to,
      input?.text,
      input?.operation_id,
      "minecraft",
    );
    return bridgeJson({ id, result: "accepted" });
  } catch (error) {
    if (!(error instanceof SocialError)) throw error;
    return bridgeJson(
      { error: error.code },
      error.code === "sms_rate_limited" ? 429 : 400,
    );
  }
}
