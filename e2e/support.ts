import type { SupabaseClient } from "@supabase/supabase-js";
import { codeAt, generateSecret } from "../src/lib/admin/totp";
import { decryptSecret, encryptSecret } from "../src/lib/secrets";

/** Makes sure the admin fixture has a confirmed TOTP secret (staff cannot open /admin without it). */
export async function ensureAdminTotp(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await db
    .from("admin_totp")
    .select("secret_enc, confirmed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.confirmed_at) return decryptSecret(data.secret_enc as string);
  const secret = generateSecret();
  await db.from("admin_totp").upsert({
    user_id: userId,
    secret_enc: encryptSecret(secret),
    confirmed_at: new Date().toISOString(),
    last_step: 0,
  });
  return secret;
}

/** A fresh code for the admin; resets the replay counter so several step-ups in one run work. */
export async function adminCode(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  await db.from("admin_totp").update({ last_step: 0 }).eq("user_id", userId);
  await db.from("rate_limit_counters").delete().eq("key", `totp:${userId}`); // attempt budget (5 per 5 min)
  const { data } = await db
    .from("admin_totp")
    .select("secret_enc")
    .eq("user_id", userId)
    .single();
  return codeAt(decryptSecret(data!.secret_enc as string));
}
