import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase-admin";
import { loadBridgeKey } from "./keys";

export const TS_WINDOW_S = 60;
export type LimitClass = "general" | "auth";
const LIMITS: Record<LimitClass, { per: number; window: number }> = {
  general: { per: 120, window: 60 },
  auth: { per: 600, window: 60 },
};

/** Every Bridge response carries server_time so the plugin can correct its clock. */
export function bridgeJson(
  body: Record<string, unknown>,
  status = 200,
  headers?: Record<string, string>,
) {
  return NextResponse.json(
    { ...body, server_time: Math.floor(Date.now() / 1000) },
    { status, headers },
  );
}

/** canonical = METHOD \n PATH(with query) \n TS \n NONCE \n sha256(body) */
export function canonicalRequest(
  method: string,
  path: string,
  ts: string,
  nonce: string,
  body: string,
) {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return [method.toUpperCase(), path, ts, nonce, bodyHash].join("\n");
}

export const hmacHex = (secret: string, canonical: string) =>
  createHmac("sha256", secret).update(canonical, "utf8").digest("hex");

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Numeric semver compare (major.minor.patch); non-numeric parts count as 0. */
export function semverLt(a: string, b: string): boolean {
  const p = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

export type BridgeAuth = {
  serverId: string;
  keyId: string;
  server: { id: string; status: string; min_bridge_version: string };
};

/**
 * Authenticates a Bridge request. Returns BridgeAuth, or a ready error response.
 * Order matters: signature first (so unauthenticated calls learn nothing and cannot fill the
 * nonce table), then timestamp window, nonce replay, rate limit, version window.
 */
export async function authenticateBridge(
  req: NextRequest,
  rawBody: string,
  klass: LimitClass,
  opts: { allowOutdated?: boolean } = {},
): Promise<BridgeAuth | NextResponse> {
  const h = req.headers;
  const keyId = h.get("x-mineort-key-id");
  const ts = h.get("x-mineort-timestamp");
  const nonce = h.get("x-mineort-nonce");
  const sig = h.get("x-mineort-signature");
  if (
    !keyId ||
    !ts ||
    !nonce ||
    !sig ||
    !/^\d{1,12}$/.test(ts) ||
    !/^[0-9a-f]{16,64}$/i.test(nonce)
  ) {
    return bridgeJson({ error: "ERR_AUTH" }, 401);
  }

  const key = await loadBridgeKey(keyId);
  const path = req.nextUrl.pathname + req.nextUrl.search;
  const expected = key
    ? hmacHex(
        key.secret,
        canonicalRequest(req.method, path, ts, nonce, rawBody),
      )
    : null;
  if (!key || !expected || !safeEqualHex(expected, sig.toLowerCase())) {
    return bridgeJson({ error: "ERR_AUTH" }, 401); // same answer for unknown key and bad signature
  }
  if (key.revoked) return bridgeJson({ error: "ERR_KEY_REVOKED" }, 401);

  const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (skew > TS_WINDOW_S) return bridgeJson({ error: "ERR_TS_SKEW" }, 401);

  const { data: fresh, error: nonceError } = await db().rpc("claim_nonce", {
    p_key_id: keyId,
    p_nonce: nonce,
  });
  if (nonceError) throw new Error(`claim_nonce: ${nonceError.message}`);
  if (fresh !== true) return bridgeJson({ error: "ERR_NONCE_REPLAY" }, 409);

  const lim = LIMITS[klass];
  const { data: ok, error: limitError } = await db().rpc("hit_rate_limit", {
    p_key: `bridge:${klass}:${keyId}`,
    p_window_seconds: lim.window,
    p_limit: lim.per,
  });
  if (limitError) throw new Error(`hit_rate_limit: ${limitError.message}`);
  if (ok !== true)
    return bridgeJson({ error: "ERR_RATE_LIMIT" }, 429, {
      "Retry-After": "10",
    });

  const { data: server, error: serverError } = await db()
    .from("bridge_servers")
    .select("id, status, min_bridge_version")
    .eq("id", key.serverId)
    .single();
  if (serverError || !server) throw new Error("bridge server missing");

  const version = h.get("x-mineort-bridge-version");
  if (
    !opts.allowOutdated &&
    version &&
    semverLt(version, server.min_bridge_version)
  ) {
    return bridgeJson(
      {
        error: "ERR_BRIDGE_OUTDATED",
        min_bridge_version: server.min_bridge_version,
      },
      426,
    );
  }
  return { serverId: key.serverId, keyId, server };
}

export const isAuthError = (r: BridgeAuth | NextResponse): r is NextResponse =>
  r instanceof NextResponse;
