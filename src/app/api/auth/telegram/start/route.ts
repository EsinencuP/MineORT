import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizationUrl } from "@/lib/auth/telegram-oidc";
import { clientIp, createLoginState, withinRateLimit } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const botId = process.env.TELEGRAM_BOT_ID;
  const appUrl = process.env.APP_URL;
  if (!botId || !appUrl) {
    return NextResponse.json(
      { error: "login_not_configured" },
      { status: 503 },
    );
  }
  const ip = clientIp(req.headers);
  if (!(await withinRateLimit(`login_start:${ip ?? "unknown"}`, 60, 30))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { state, nonce, codeChallenge } = await createLoginState(
    req.nextUrl.searchParams.get("return_to"),
  );
  return NextResponse.redirect(
    buildAuthorizationUrl({
      botId,
      redirectUri: `${appUrl}/api/auth/telegram/callback`,
      state,
      nonce,
      codeChallenge,
    }),
  );
}
