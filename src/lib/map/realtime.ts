import "server-only";
import { SignJWT } from "jose";
import { claimsFor, type ViewerClaims } from "./visibility";

export const TOKEN_TTL_S = 600;

/**
 * Token a browser uses to join the private position channels. It is signed with the project's
 * JWT secret, so Supabase Realtime accepts it, and carries only the claims the channel policy
 * reads (see the map_positions migration). The role is `authenticated`, which has no grants on
 * any table here: the token opens the channels and nothing else.
 */
export async function signRealtimeToken(v: {
  userId: string;
  guildId: string | null;
  staff: boolean;
}): Promise<{ token: string; expiresAt: number; claims: ViewerClaims }> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new RealtimeUnconfigured();
  const claims = claimsFor(v);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_TTL_S;
  const token = await new SignJWT({ ...claims, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(v.userId)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt, claims };
}

export class RealtimeUnconfigured extends Error {
  constructor() {
    super("SUPABASE_JWT_SECRET is not set");
  }
}

/** Sends messages to private channels. One call carries every channel of a batch. */
export async function broadcast(
  messages: { topic: string; event: string; payload: unknown }[],
): Promise<void> {
  if (messages.length === 0) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ ...m, private: true })),
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`realtime broadcast ${res.status}`);
}
