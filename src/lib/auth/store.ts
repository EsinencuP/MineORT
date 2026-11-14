import "server-only";
import { isIP } from "node:net";
import { db } from "@/lib/supabase-admin";
import { telegramIdHash } from "@/lib/secrets";
import { pkcePair, randomToken, sha256Hex } from "./crypto";
import {
  LOGIN_STATE_TTL_MS,
  extendedExpiry,
  isSessionValid,
  newExpiry,
  safeReturnTo,
  type SessionRow,
} from "./session-policy";

function throwIf(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** First hop of x-forwarded-for (set by the platform proxy), validated as an IP. */
export function clientIp(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return raw && isIP(raw) ? raw : null;
}

export async function logSecurityEvent(e: {
  type: string;
  severity?: "info" | "warning" | "critical";
  ip: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await db()
    .from("security_events")
    .insert({
      type: e.type,
      severity: e.severity ?? "warning",
      ip: e.ip,
      user_id: e.userId ?? null,
      details: e.details ?? {},
    });
  throwIf(error, "security_events insert");
}

/** true = within limit. */
export async function withinRateLimit(
  key: string,
  windowSeconds: number,
  limit: number,
): Promise<boolean> {
  const { data, error } = await db().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });
  throwIf(error, "hit_rate_limit");
  return data === true;
}

export async function createLoginState(returnTo: string | null) {
  const state = randomToken(24);
  const nonce = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const { error } = await db()
    .from("login_states")
    .insert({
      state_hash: sha256Hex(state),
      nonce,
      code_verifier: verifier,
      return_to: safeReturnTo(returnTo),
      expires_at: new Date(Date.now() + LOGIN_STATE_TTL_MS).toISOString(),
    });
  throwIf(error, "login_states insert");
  return { state, nonce, codeChallenge: challenge };
}

/** Single use: a second call with the same state returns null. */
export async function consumeLoginState(state: string) {
  const { data, error } = await db().rpc("consume_login_state", {
    p_state_hash: sha256Hex(state),
  });
  throwIf(error, "consume_login_state");
  const row = Array.isArray(data) ? data[0] : null;
  return row
    ? (row as { nonce: string; code_verifier: string; return_to: string })
    : null;
}

/** Existing user for a Telegram ID, if any (a deleted account has no identity any more). */
export async function findUserByTelegramId(
  telegramId: string,
): Promise<string | null> {
  const { data, error } = await db()
    .from("telegram_identities")
    .select("user_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  throwIf(error, "telegram_identities select");
  return (data?.user_id as string | undefined) ?? null;
}

export async function upsertTelegramUser(p: {
  telegramId: string;
  username: string | null;
  name: string | null;
}) {
  const { data, error } = await db().rpc("upsert_telegram_user", {
    p_telegram_id: p.telegramId,
    p_username: p.username,
    p_display_name: p.name,
  });
  throwIf(error, "upsert_telegram_user");
  const row = (Array.isArray(data) ? data[0] : data) as {
    user_id: string;
    is_new: boolean;
  };
  return { userId: row.user_id, isNew: row.is_new };
}

export async function getUserAccess(userId: string) {
  const { data, error } = await db()
    .from("users")
    .select("account_status, site_role, banned_until, restriction_reason")
    .eq("id", userId)
    .single();
  throwIf(error, "users select");
  return data as {
    account_status: string;
    site_role: string;
    banned_until: string | null;
    restriction_reason: string | null;
  };
}

/** True when a deleted-and-banned Telegram identity may not sign in (checked before any user is created). */
export async function isTombstoneBlocked(telegramId: string): Promise<boolean> {
  const { data, error } = await db().rpc("tombstone_blocks", {
    p_tg_hash: telegramIdHash(telegramId),
  });
  throwIf(error, "tombstone_blocks");
  return data === true;
}

export async function createSession(p: {
  userId: string;
  isAdmin?: boolean;
  ip: string | null;
  userAgent: string | null;
}) {
  const token = randomToken(32);
  const expires = newExpiry(p.isAdmin ?? false);
  const { error } = await db()
    .from("user_sessions")
    .insert({
      user_id: p.userId,
      token_hash: sha256Hex(token),
      is_admin_session: p.isAdmin ?? false,
      expires_at: expires.toISOString(),
      ip: p.ip,
      user_agent: p.userAgent?.slice(0, 300) ?? null,
    });
  throwIf(error, "user_sessions insert");
  return { token, expires };
}

/** Returns the session's user if the token is valid; extends normal sessions (rolling 30 days). */
export async function resolveSession(token: string) {
  const { data, error } = await db()
    .from("user_sessions")
    .select(
      "id, user_id, expires_at, revoked_at, is_admin_session, created_at, last_seen_at, step_up_until",
    )
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  throwIf(error, "user_sessions select");
  if (!data || !isSessionValid(data as SessionRow)) return null;

  const user = await getUserAccess(data.user_id);
  if (user.account_status !== "active") return null;

  const next = extendedExpiry(data as SessionRow);
  if (next && Date.now() - Date.parse(data.last_seen_at) > 60 * 60 * 1000) {
    await db()
      .from("user_sessions")
      .update({
        expires_at: next.toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", data.id);
  }
  return {
    sessionId: data.id as string,
    userId: data.user_id as string,
    isAdminSession: data.is_admin_session as boolean,
    createdAt: data.created_at as string,
    stepUpUntil: (data.step_up_until as string | null) ?? null,
    ...user,
  };
}

export async function revokeSession(token: string) {
  const { error } = await db()
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", sha256Hex(token))
    .is("revoked_at", null);
  throwIf(error, "revoke session");
}

export async function revokeAllSessions(userId: string) {
  const { error } = await db()
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  throwIf(error, "revoke all sessions");
}
