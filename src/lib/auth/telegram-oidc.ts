import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const AUTH_URL = `${TELEGRAM_ISSUER}/auth`;
const TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
const JWKS_URL = new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`);

export type TelegramProfile = {
  telegramId: string; // numeric Telegram ID as a string (identity key, never @username)
  username: string | null;
  name: string | null;
};

export class OidcError extends Error {
  constructor(
    public readonly code:
      | "bad_signature"
      | "bad_claims"
      | "nonce_mismatch"
      | "no_telegram_id"
      | "token_exchange_failed",
    message: string,
  ) {
    super(message);
  }
}

let remoteKeys: JWTVerifyGetKey | undefined;
function defaultKeys(): JWTVerifyGetKey {
  return (remoteKeys ??= createRemoteJWKSet(JWKS_URL, {
    cooldownDuration: 30_000,
  }));
}

export function buildAuthorizationUrl(p: {
  botId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: p.botId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: "openid profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/**
 * Verifies signature (JWKS), iss, aud (= bot id), exp and nonce of a Telegram id_token.
 * `keys` is injectable for tests.
 */
export async function verifyIdToken(
  idToken: string,
  opts: { botId: string; nonce: string; keys?: JWTVerifyGetKey },
): Promise<TelegramProfile> {
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, opts.keys ?? defaultKeys(), {
      issuer: TELEGRAM_ISSUER,
      audience: opts.botId,
      algorithms: ["RS256", "ES256"],
      clockTolerance: 5,
    }));
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    throw new OidcError(
      code.startsWith("ERR_JWS") || code.startsWith("ERR_JWKS")
        ? "bad_signature"
        : "bad_claims",
      "id_token rejected",
    );
  }
  if (payload.nonce !== opts.nonce) {
    throw new OidcError("nonce_mismatch", "nonce mismatch");
  }
  const id = payload.id;
  if (
    !(typeof id === "number" || typeof id === "string") ||
    !/^\d+$/.test(String(id))
  ) {
    throw new OidcError("no_telegram_id", "id claim missing");
  }
  return {
    telegramId: String(id),
    username:
      typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : null,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export async function exchangeCode(p: {
  botId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const res = await (p.fetchImpl ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${p.botId}:${p.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: p.botId,
      code_verifier: p.codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new OidcError(
      "token_exchange_failed",
      `token endpoint ${res.status}`,
    );
  }
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) {
    throw new OidcError("token_exchange_failed", "no id_token in response");
  }
  return body.id_token;
}
