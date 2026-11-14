import "server-only";
import { db } from "@/lib/supabase-admin";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { withinRateLimit } from "@/lib/auth/store";
import { STEP_SECONDS, generateSecret, verifyTotp } from "./totp";

export const STEP_UP_MS = 15 * 60 * 1000;

function fail(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function getTotpState(
  userId: string,
): Promise<{ confirmed: boolean; pending: boolean }> {
  const { data, error } = await db()
    .from("admin_totp")
    .select("confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  fail(error, "admin_totp select");
  return {
    confirmed: !!data?.confirmed_at,
    pending: !!data && !data.confirmed_at,
  };
}

export async function hasConfirmedTotp(userId: string) {
  return (await getTotpState(userId)).confirmed;
}

/** Starts (or restarts) enrollment; the secret is shown until the first valid code confirms it. */
export async function startTotpEnrollment(userId: string): Promise<string> {
  const state = await getTotpState(userId);
  if (state.confirmed) throw new Error("TOTP is already configured");
  const { data } = await db()
    .from("admin_totp")
    .select("secret_enc")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return decryptSecret(data.secret_enc as string);
  const secret = generateSecret();
  const { error } = await db()
    .from("admin_totp")
    .insert({ user_id: userId, secret_enc: encryptSecret(secret) });
  fail(error, "admin_totp insert");
  return secret;
}

export type TotpResult = "ok" | "invalid" | "rate_limited" | "not_configured";

async function checkCode(
  userId: string,
  code: string,
  requireConfirmed: boolean,
) {
  if (!(await withinRateLimit(`totp:${userId}`, 300, 5)))
    return { result: "rate_limited" as const };
  const { data, error } = await db()
    .from("admin_totp")
    .select("secret_enc, confirmed_at, last_step")
    .eq("user_id", userId)
    .maybeSingle();
  fail(error, "admin_totp select");
  if (!data || (requireConfirmed && !data.confirmed_at))
    return { result: "not_configured" as const };
  const v = verifyTotp(
    decryptSecret(data.secret_enc as string),
    code.trim(),
    Date.now(),
    Number(data.last_step),
  );
  if (!v.ok) return { result: "invalid" as const };
  // Consume the step atomically: a concurrent reuse of the same code finds last_step already moved.
  const { data: moved, error: updError } = await db()
    .from("admin_totp")
    .update({ last_step: v.step })
    .eq("user_id", userId)
    .lt("last_step", v.step)
    .select("user_id");
  fail(updError, "admin_totp update");
  if (!moved || moved.length === 0) return { result: "invalid" as const };
  return { result: "ok" as const };
}

/** Confirms enrollment with the first valid code. */
export async function confirmTotp(
  userId: string,
  code: string,
): Promise<TotpResult> {
  const r = await checkCode(userId, code, false);
  if (r.result !== "ok") return r.result;
  const { error } = await db()
    .from("admin_totp")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("confirmed_at", null);
  fail(error, "admin_totp confirm");
  return "ok";
}

/** Verifies a code and opens a 15-minute step-up window on this session. */
export async function stepUp(
  userId: string,
  sessionId: string,
  code: string,
): Promise<TotpResult> {
  const r = await checkCode(userId, code, true);
  if (r.result !== "ok") return r.result;
  const { error } = await db()
    .from("user_sessions")
    .update({ step_up_until: new Date(Date.now() + STEP_UP_MS).toISOString() })
    .eq("id", sessionId);
  fail(error, "step-up update");
  return "ok";
}

export const isStepUpFresh = (stepUpUntil: string | null, now = Date.now()) =>
  !!stepUpUntil && Date.parse(stepUpUntil) > now;

export { STEP_SECONDS };
