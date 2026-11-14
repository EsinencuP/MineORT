import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { pkcePair } from "./crypto";
import {
  TELEGRAM_ISSUER,
  buildAuthorizationUrl,
  verifyIdToken,
} from "./telegram-oidc";

const BOT = "9046847629";
let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: CryptoKey;

async function sign(
  claims: Record<string, unknown>,
  opts: {
    iss?: string;
    aud?: string;
    exp?: string | number;
    key?: CryptoKey;
  } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? TELEGRAM_ISSUER)
    .setAudience(opts.aud ?? BOT)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }],
  });
});

const base = {
  nonce: "n1",
  id: 987654321,
  preferred_username: "alice",
  name: "Alice",
};

describe("verifyIdToken", () => {
  it("accepts a valid token and returns the numeric Telegram id", async () => {
    const p = await verifyIdToken(await sign(base), {
      botId: BOT,
      nonce: "n1",
      keys,
    });
    expect(p).toEqual({
      telegramId: "987654321",
      username: "alice",
      name: "Alice",
    });
  });

  it("rejects a wrong nonce (replay of another login)", async () => {
    await expect(
      verifyIdToken(await sign(base), { botId: BOT, nonce: "other", keys }),
    ).rejects.toMatchObject({ code: "nonce_mismatch" });
  });

  it("rejects a forged signature", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await sign(base, { key: other.privateKey });
    await expect(
      verifyIdToken(forged, { botId: BOT, nonce: "n1", keys }),
    ).rejects.toMatchObject({ code: "bad_signature" });
  });

  it("rejects wrong issuer, wrong audience and expired tokens", async () => {
    for (const opts of [
      { iss: "https://evil.example" },
      { aud: "1" },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    ]) {
      await expect(
        verifyIdToken(await sign(base, opts), {
          botId: BOT,
          nonce: "n1",
          keys,
        }),
      ).rejects.toMatchObject({ code: "bad_claims" });
    }
  });

  it("rejects a token without a numeric id claim", async () => {
    await expect(
      verifyIdToken(await sign({ nonce: "n1" }), {
        botId: BOT,
        nonce: "n1",
        keys,
      }),
    ).rejects.toMatchObject({ code: "no_telegram_id" });
  });

  it("rejects garbage", async () => {
    await expect(
      verifyIdToken("not.a.jwt", { botId: BOT, nonce: "n1", keys }),
    ).rejects.toBeTruthy();
  });
});

describe("authorization url and PKCE", () => {
  it("carries S256 challenge, state and nonce", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const url = new URL(
      buildAuthorizationUrl({
        botId: BOT,
        redirectUri: "https://x.test/cb",
        state: "s",
        nonce: "n",
        codeChallenge: challenge,
      }),
    );
    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("nonce")).toBe("n");
    expect(url.searchParams.get("scope")).toContain("openid");
  });
});
