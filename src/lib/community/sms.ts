import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/supabase-admin";
import { isEnabled } from "@/lib/flags";
import { SocialError } from "@/lib/social/errors";
import { EVENT_ID } from "@/lib/social/events";
import { authorsOf } from "@/lib/social/store";

const NICK = /^[A-Za-z0-9_]{3,16}$/;
export const smsEnabled = () => isEnabled("ff_community_sms");
export type Sms = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

function configuredLimit(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value >= 1 && value <= 120
    ? value
    : fallback;
}

export async function sendSms(
  sender: string,
  to: unknown,
  body: unknown,
  operation: unknown,
  source: "site" | "minecraft" | "telegram",
  reply?: string,
) {
  const text = typeof body === "string" ? body.trim() : "";
  if (
    typeof operation !== "string" ||
    !EVENT_ID.test(operation) ||
    (!reply && (typeof to !== "string" || !NICK.test(to))) ||
    text.length < 1 ||
    text.length > 300 ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)
  )
    throw new SocialError("sms_invalid");
  const { data, error } = await db().rpc("sms_send", {
    p_sender: sender,
    p_to: reply ? "" : to,
    p_body: text,
    p_operation: operation,
    p_source: source,
    p_user_limit: configuredLimit("SMS_SENDER_PER_MINUTE", 8),
    p_recipient_limit: configuredLimit("SMS_RECIPIENT_PER_MINUTE", 18),
    p_pair_limit: configuredLimit("SMS_PAIR_PER_MINUTE", 5),
    p_reply: reply ?? null,
  });
  if (error?.code === "P0001") throw new SocialError(error.message);
  if (error) throw new Error(`sms send: ${error.message}`);
  return data as string;
}

export async function listSms(userId: string, withNick?: string) {
  let query = db()
    .from("sms_messages")
    .select("id,sender_id,recipient_id,body,created_at");
  if (withNick) {
    const peer = await smsContact(withNick);
    if (!peer || peer === userId) return [];
    query = query.or(
      `and(sender_id.eq.${userId},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${userId})`,
    );
  } else query = query.or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`sms inbox: ${error.message}`);
  const rows = data as Sms[];
  const ids = [
    ...new Set(
      rows.map((row) =>
        row.sender_id === userId ? row.recipient_id : row.sender_id,
      ),
    ),
  ];
  const names = await authorsOf(ids);
  return rows.map((row) => ({
    ...row,
    peer: names.get(
      row.sender_id === userId ? row.recipient_id : row.sender_id,
    ),
  }));
}

export async function smsContact(nick: string) {
  if (!NICK.test(nick)) return null;
  const { data, error } = await db()
    .from("minecraft_identities")
    .select("user_id")
    .ilike("nickname", nick.replace(/_/g, "\\_"))
    .eq("binding_status", "confirmed")
    .eq("game_identity", "confirmed")
    .maybeSingle();
  if (error) throw new Error(`sms nickname: ${error.message}`);
  return data?.user_id as string | undefined;
}

export async function smsMessage(userId: string, id: string, recheck = false) {
  if (!EVENT_ID.test(id)) return null;
  let query = db()
    .from("sms_messages")
    .select("id,sender_id,recipient_id,body,created_at")
    .eq("id", id);
  query = recheck
    ? query.eq("recipient_id", userId)
    : query.or(`recipient_id.eq.${userId},sender_id.eq.${userId}`);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`sms lookup: ${error.message}`);
  if (!data) return null;
  const row = data as Sms;
  if (recheck) {
    const { data: allowed, error: permissionError } = await db().rpc(
      "sms_allowed",
      { sender: row.sender_id, recipient: userId },
    );
    if (permissionError)
      throw new Error(`sms delivery permissions: ${permissionError.message}`);
    if (allowed !== true) return null;
  }
  const names = await authorsOf([row.sender_id]);
  return { ...row, sender: names.get(row.sender_id)?.nick ?? "Игрок" };
}

export async function smsReplyToken(notificationId: string, userId: string) {
  const { data, error } = await db()
    .from("sms_reply_tokens")
    .upsert(
      {
        notification_id: notificationId,
        user_id: userId,
      },
      { onConflict: "notification_id", ignoreDuplicates: true },
    )
    .select("token")
    .maybeSingle();
  if (error) throw new Error(`sms reply token: ${error.message}`);
  if (data) return data.token as string;
  const existing = await db()
    .from("sms_reply_tokens")
    .select("token")
    .eq("notification_id", notificationId)
    .single();
  if (existing.error)
    throw new Error(`sms reply token: ${existing.error.message}`);
  return existing.data.token as string;
}

export async function telegramPromptToken(chatId: number, token: string) {
  if (!EVENT_ID.test(token)) return null;
  const { data, error } = await db()
    .from("telegram_bot_links")
    .select("user_id, users!inner(account_status)")
    .eq("chat_id", chatId)
    .eq("status", "connected")
    .eq("users.account_status", "active")
    .maybeSingle();
  if (error) throw new Error(`sms reply identity: ${error.message}`);
  if (!data) return null;
  const row = await db()
    .from("sms_reply_tokens")
    .select("token,user_id,expires_at")
    .eq("token", token)
    .eq("user_id", data.user_id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (row.error) throw new Error(`sms reply lookup: ${row.error.message}`);
  return row.data;
}

export async function attachTelegramPrompt(
  userId: string,
  token: string,
  prompt: number,
) {
  const { error } = await db()
    .from("sms_reply_tokens")
    .update({ prompt_id: prompt })
    .eq("token", token)
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (error) throw new Error(`sms reply prompt: ${error.message}`);
}

export async function replyFromTelegram(
  chatId: number,
  promptId: number,
  body: string,
) {
  const { data: link, error } = await db()
    .from("telegram_bot_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error(`sms link lookup: ${error.message}`);
  if (!link) return false;
  const result = await db()
    .from("sms_reply_tokens")
    .select("token")
    .eq("user_id", link.user_id)
    .eq("prompt_id", promptId)
    .maybeSingle();
  if (result.error)
    throw new Error(`sms telegram prompt lookup: ${result.error.message}`);
  if (!result.data) return false;
  const token = result.data.token as string;
  await sendSms(link.user_id, "", body, randomUUID(), "telegram", token);
  return true;
}
