import { NextResponse, type NextRequest } from "next/server";
import {
  OidcError,
  exchangeCode,
  verifyIdToken,
} from "@/lib/auth/telegram-oidc";
import {
  clientIp,
  consumeLoginState,
  createSession,
  getUserAccess,
  logSecurityEvent,
  upsertTelegramUser,
  withinRateLimit,
} from "@/lib/auth/store";
import {
  LOGIN_STATE_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
} from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

function back(req: NextRequest, error: string) {
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const res = NextResponse.redirect(new URL(`/login?error=${error}`, base));
  res.cookies.delete(LOGIN_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const botId = process.env.TELEGRAM_BOT_ID;
  const secret = process.env.TELEGRAM_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!botId || !secret || !appUrl) return back(req, "not_configured");

  const ip = clientIp(req.headers);
  // Limit: 10 login attempts per minute per IP (TC-AUTH-04a).
  if (!(await withinRateLimit(`login_cb:${ip ?? "unknown"}`, 60, 10))) {
    await logSecurityEvent({ type: "login_rate_limited", ip });
    return back(req, "rate_limited");
  }

  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");

  // Widget cancelled by the user: nothing is created.
  if (params.get("error")) {
    if (state) await consumeLoginState(state);
    return back(req, "cancelled");
  }
  if (!state || !code) return back(req, "invalid");

  // The state must come back with the browser that started the login (login CSRF).
  if (req.cookies.get(LOGIN_STATE_COOKIE)?.value !== state) {
    await consumeLoginState(state);
    await logSecurityEvent({ type: "login_state_cookie_mismatch", ip });
    return back(req, "invalid");
  }

  // Single use: a replayed or unknown state is rejected here.
  const saved = await consumeLoginState(state);
  if (!saved) {
    await logSecurityEvent({ type: "login_state_invalid_or_replayed", ip });
    return back(req, "invalid");
  }

  try {
    const idToken = await exchangeCode({
      botId,
      clientSecret: secret,
      code,
      codeVerifier: saved.code_verifier,
      redirectUri: `${appUrl}/api/auth/telegram/callback`,
    });
    const profile = await verifyIdToken(idToken, { botId, nonce: saved.nonce });
    const { userId } = await upsertTelegramUser(profile);

    const access = await getUserAccess(userId);
    if (access.account_status !== "active") {
      await logSecurityEvent({ type: "login_blocked_account", ip, userId });
      return back(req, "blocked");
    }

    const { token } = await createSession({
      userId,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    const target = new URL(saved.return_to, appUrl);
    if (target.origin !== new URL(appUrl).origin) return back(req, "invalid");
    const res = NextResponse.redirect(target);
    res.cookies.delete(LOGIN_STATE_COOKIE);
    // Cookie lives a year; the database expiry (30 days rolling) is the source of truth.
    res.cookies.set(SESSION_COOKIE, token, {
      ...cookieOptions(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
    });
    return res;
  } catch (e) {
    if (e instanceof OidcError) {
      await logSecurityEvent({
        type: "login_invalid_token",
        ip,
        details: { reason: e.code },
      });
      return back(req, "invalid");
    }
    throw e;
  }
}
