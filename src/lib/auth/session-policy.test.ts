import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_MS,
  SESSION_TTL_MS,
  cookieOptions,
  extendedExpiry,
  isSessionValid,
  newExpiry,
  safeReturnTo,
} from "./session-policy";

const now = Date.parse("2026-11-14T12:00:00Z");
const row = (over = {}) => ({
  expires_at: new Date(now + 1000).toISOString(),
  revoked_at: null,
  is_admin_session: false,
  created_at: new Date(now - 1000).toISOString(),
  ...over,
});

describe("session policy", () => {
  it("normal sessions live 30 days, admin sessions 12 hours", () => {
    expect(newExpiry(false, now).getTime() - now).toBe(SESSION_TTL_MS);
    expect(newExpiry(true, now).getTime() - now).toBe(ADMIN_SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(30 * 24 * 3600 * 1000);
    expect(ADMIN_SESSION_TTL_MS).toBe(12 * 3600 * 1000);
  });

  it("expired or revoked sessions are invalid", () => {
    expect(isSessionValid(row(), now)).toBe(true);
    expect(
      isSessionValid(row({ expires_at: new Date(now - 1).toISOString() }), now),
    ).toBe(false);
    expect(
      isSessionValid(row({ revoked_at: new Date(now).toISOString() }), now),
    ).toBe(false);
  });

  it("rolls normal sessions forward, never admin sessions", () => {
    expect(extendedExpiry(row(), now)?.getTime()).toBe(now + SESSION_TTL_MS);
    expect(extendedExpiry(row({ is_admin_session: true }), now)).toBeNull();
  });

  it("cookie is httpOnly, SameSite=Lax and Secure in production", () => {
    const o = cookieOptions(new Date(now), true);
    expect(o).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("return_to only accepts same-site relative paths", () => {
    expect(safeReturnTo("/players?tab=guilds")).toBe("/players?tab=guilds");
    for (const bad of [
      "//evil.test",
      "https://evil.test",
      "/\\evil",
      "javascript:1",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnTo(bad)).toBe("/dashboard");
    }
  });
});
