import { createHmac, timingSafeEqual } from "node:crypto";

/** Fixture users for E2E: fixed, clearly fake Telegram IDs (far above real ID ranges in use). */
export const TEST_USERS = {
  alice: {
    telegramId: "9990000001",
    username: "test_alice",
    name: "Test Alice",
  },
  bob: { telegramId: "9990000002", username: "test_bob", name: "Test Bob" },
} as const;
export type TestUserKey = keyof typeof TEST_USERS;

type Env = Record<string, string | undefined>;

/**
 * Enabled only outside production, explicitly switched on, with a long enough secret.
 * APP_ENV (local | staging | preview | production) is authoritative when set; without it the
 * platform hints (VERCEL_ENV, NODE_ENV) are used and anything that looks like production is off.
 */
export function isTestLoginEnabled(env: Env = process.env): boolean {
  const production = env.APP_ENV
    ? env.APP_ENV === "production"
    : env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
  return (
    !production &&
    env.TEST_LOGIN_ENABLED === "true" &&
    (env.TEST_LOGIN_SECRET?.length ?? 0) >= 32
  );
}

export type TestTokenPayload = { u: TestUserKey; exp: number; jti: string };

const b64 = (s: string) => Buffer.from(s).toString("base64url");

export function signTestToken(
  payload: TestTokenPayload,
  secret: string,
): string {
  const body = b64(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyTestToken(
  token: string,
  secret: string,
  now = Date.now(),
): TestTokenPayload | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    const p = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as TestTokenPayload;
    if (!(p.u in TEST_USERS) || typeof p.jti !== "string" || p.jti.length < 8)
      return null;
    if (typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    return p;
  } catch {
    return null;
  }
}
