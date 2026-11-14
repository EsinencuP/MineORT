import { NextResponse, type NextRequest } from "next/server";
import {
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_TTL_MS,
  cookieOptions,
} from "@/lib/auth/session-policy";
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
  const res = NextResponse.redirect(
    buildAuthorizationUrl({
      botId,
      redirectUri: `${appUrl}/api/auth/telegram/callback`,
      state,
      nonce,
      codeChallenge,
    }),
  );
  res.cookies.set(
    LOGIN_STATE_COOKIE,
    state,
    cookieOptions(new Date(Date.now() + LOGIN_STATE_TTL_MS)),
  );
  return res;
}
