import { NextResponse, type NextRequest } from "next/server";
import {
  TEST_USERS,
  isTestLoginEnabled,
  verifyTestToken,
} from "@/lib/auth/test-login";
import { SESSION_COOKIE, cookieOptions } from "@/lib/auth/session-policy";
import {
  clientIp,
  createSession,
  logSecurityEvent,
  upsertTelegramUser,
} from "@/lib/auth/store";
import { db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404 });

/** E2E-only login: absent (404) in production; needs a signed one-time token. */
export async function GET(req: NextRequest) {
  if (!isTestLoginEnabled()) return notFound();
  const ip = clientIp(req.headers);
  const payload = verifyTestToken(
    req.nextUrl.searchParams.get("token") ?? "",
    process.env.TEST_LOGIN_SECRET!,
  );
  if (!payload) {
    await logSecurityEvent({ type: "test_login_rejected", ip });
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  // One-time: the jti primary key rejects a second use.
  const { error } = await db()
    .from("test_login_tokens")
    .insert({ jti: payload.jti });
  if (error) {
    await logSecurityEvent({ type: "test_login_replay", ip });
    return NextResponse.json({ error: "token_used" }, { status: 401 });
  }
  const fixture = TEST_USERS[payload.u];
  const { userId } = await upsertTelegramUser(fixture);
  const { token } = await createSession({
    userId,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  const res = NextResponse.redirect(
    new URL("/dashboard", process.env.APP_URL ?? req.nextUrl.origin),
  );
  res.cookies.set(
    SESSION_COOKIE,
    token,
    cookieOptions(new Date(Date.now() + 365 * 24 * 3600 * 1000)),
  );
  return res;
}
