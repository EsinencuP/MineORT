import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/supabase-admin";

const tokenSecret = () =>
  process.env.CALENDAR_TOKEN_SECRET ?? process.env.TOMBSTONE_HMAC_KEY;
export const calendarSubscriptionConfigured = () =>
  (tokenSecret()?.length ?? 0) >= 32;

function signature(nonce: string) {
  return createHmac("sha256", tokenSecret()!)
    .update(`mineort-calendar:${nonce}`)
    .digest("base64url");
}

export async function calendarSubscriptionPath(userId: string) {
  if (!calendarSubscriptionConfigured()) return null;
  const { data, error } = await db()
    .from("event_calendar_tokens")
    .select("token_hash")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`calendar token lookup: ${error.message}`);
  if (!data) return null;
  return `/api/calendar/subscription/${data.token_hash}.${signature(data.token_hash)}`;
}

export async function changeCalendarSubscription(
  userId: string,
  revoke: boolean,
) {
  const tokens = db().from("event_calendar_tokens");
  const { error } = revoke
    ? await tokens.delete().eq("user_id", userId)
    : await tokens.upsert({
        user_id: userId,
        token_hash: randomBytes(24).toString("base64url"),
        created_at: new Date().toISOString(),
      });
  if (error) throw new Error(`calendar subscription update: ${error.message}`);
}

export async function calendarSubscriber(token: string) {
  if (!calendarSubscriptionConfigured()) return null;
  const match = /^([\w-]{32})\.([\w-]{43})$/.exec(token);
  if (
    !match ||
    !timingSafeEqual(Buffer.from(signature(match[1])), Buffer.from(match[2]))
  )
    return null;
  const { data, error } = await db()
    .from("event_calendar_tokens")
    .select("user_id, users!inner(account_status)")
    .eq("token_hash", match[1])
    .eq("users.account_status", "active")
    .maybeSingle();
  if (error) throw new Error(`calendar subscriber: ${error.message}`);
  return data?.user_id as string | undefined;
}
