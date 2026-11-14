// Idempotent seed of E2E fixture users. Usage: npm run seed:test (needs service key in env).
import { createClient } from "@supabase/supabase-js";
import { TEST_USERS } from "../src/lib/auth/test-login.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
if (process.env.APP_ENV === "production")
  throw new Error("refusing to seed production");

const db = createClient(url, key, { auth: { persistSession: false } });
for (const u of Object.values(TEST_USERS)) {
  const { error } = await db.rpc("upsert_telegram_user", {
    p_telegram_id: u.telegramId,
    p_username: u.username,
    p_display_name: u.name,
  });
  if (error) throw error;
  console.log("seeded", u.username);
}
