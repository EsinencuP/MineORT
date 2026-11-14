/** Session lifetime rules (US-E02-02, US-E02-07): pure, easy to test. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days rolling
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, not rolling
export const STEP_UP_TTL_MS = 15 * 60 * 1000;
export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

export const SESSION_COOKIE = "mo_session";

export type SessionRow = {
  expires_at: string;
  revoked_at: string | null;
  is_admin_session: boolean;
  created_at: string;
};

export function newExpiry(isAdmin: boolean, now = Date.now()): Date {
  return new Date(now + (isAdmin ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS));
}

export function isSessionValid(s: SessionRow, now = Date.now()): boolean {
  return s.revoked_at === null && Date.parse(s.expires_at) > now;
}

/** Rolling extension for normal sessions only; admin sessions keep their fixed expiry. */
export function extendedExpiry(s: SessionRow, now = Date.now()): Date | null {
  return s.is_admin_session ? null : new Date(now + SESSION_TTL_MS);
}

export function cookieOptions(
  expires: Date,
  secure = process.env.NODE_ENV === "production",
) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Only same-site relative paths are allowed as post-login targets (no open redirect). */
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard";
  }
  return value;
}
