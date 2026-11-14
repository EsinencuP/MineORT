import { describe, expect, it } from "vitest";
import {
  isTestLoginEnabled,
  signTestToken,
  verifyTestToken,
} from "./test-login";

const secret = "s".repeat(40);
const exp = Math.floor(Date.now() / 1000) + 60;

describe("test login", () => {
  it("is off by default and in production, on only when switched on elsewhere", () => {
    expect(isTestLoginEnabled({})).toBe(false);
    expect(
      isTestLoginEnabled({
        TEST_LOGIN_ENABLED: "true",
        TEST_LOGIN_SECRET: secret,
      }),
    ).toBe(true);
    for (const prod of [
      { VERCEL_ENV: "production" },
      { APP_ENV: "production" },
      { NODE_ENV: "production" },
    ]) {
      expect(
        isTestLoginEnabled({
          ...prod,
          TEST_LOGIN_ENABLED: "true",
          TEST_LOGIN_SECRET: secret,
        }),
      ).toBe(false);
    }
    expect(
      isTestLoginEnabled({
        TEST_LOGIN_ENABLED: "true",
        TEST_LOGIN_SECRET: "short",
      }),
    ).toBe(false);
  });

  it("accepts a signed token and rejects tampering, wrong secret and expiry", () => {
    const t = signTestToken({ u: "alice", exp, jti: "abcdefgh1" }, secret);
    expect(verifyTestToken(t, secret)?.u).toBe("alice");
    expect(verifyTestToken(t, "x".repeat(40))).toBeNull();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ u: "bob", exp, jti: "abcdefgh1" }),
    ).toString("base64url");
    expect(verifyTestToken(`${forged}.${mac}`, secret)).toBeNull();
    expect(verifyTestToken(`${body}.${mac}.x`, secret)).toBeNull();
    const old = signTestToken(
      { u: "alice", exp: exp - 3600, jti: "abcdefgh1" },
      secret,
    );
    expect(verifyTestToken(old, secret)).toBeNull();
  });
});
