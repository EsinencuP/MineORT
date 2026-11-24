import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/supabase-admin";
import { withinRateLimit } from "@/lib/auth/store";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export const botUsername = () => {
  const name = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  return name && /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : null;
};

export function botWebhookAllowed(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const presented = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret.length < 24 || !presented) return false;
  const expected = Buffer.from(secret);
  const candidate = Buffer.from(presented);
  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  );
}

export async function botStatus(userId: string) {
  const { data, error } = await db()
    .from("telegram_bot_links")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`bot status: ${error.message}`);
  return data?.status as "pending" | "connected" | "blocked" | undefined;
}

export async function beginBotLink(userId: string) {
  const name = botUsername();
  if (
    !name ||
    !process.env.TELEGRAM_BOT_TOKEN ||
    !process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return null;
  const code = randomBytes(24).toString("base64url");
  const { error } = await db()
    .from("telegram_bot_links")
    .upsert({
      user_id: userId,
      chat_id: null,
      status: "pending",
      code_hash: hash(code),
      code_source: "site",
      code_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  if (error) throw new Error(`bot link request: ${error.message}`);
  return `https://t.me/${name}?start=link_${code}`;
}

export async function beginGameBotLink(chatId: number) {
  if (!(await withinRateLimit(`community:telegram-code:${chatId}`, 3600, 5)))
    return null;
  const { data, error } = await db()
    .from("telegram_identities")
    .select("user_id, users!inner(account_status)")
    .eq("telegram_id", chatId)
    .eq("users.account_status", "active")
    .maybeSingle();
  if (error) throw new Error(`bot game link identity: ${error.message}`);
  if (!data) return null;
  const code = randomBytes(5).toString("hex").toUpperCase();
  const result = await db()
    .from("telegram_bot_links")
    .upsert(
      {
        user_id: data.user_id,
        code_hash: hash(code),
        code_source: "minecraft",
        code_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      { defaultToNull: false },
    );
  if (result.error) throw new Error(`bot game link: ${result.error.message}`);
  return code;
}

export async function confirmGameBotLink(userId: string, code: string) {
  if (
    !/^[A-F0-9]{10}$/i.test(code) ||
    !(await withinRateLimit(`community:game-bot-code:${userId}`, 300, 10))
  )
    return false;
  const { data, error } = await db().rpc("confirm_game_bot", {
    p_user: userId,
    p_hash: hash(code.toUpperCase()),
  });
  if (error) throw new Error(`bot game link confirmation: ${error.message}`);
  return data === true;
}

export async function confirmBotLink(chatId: number, code: string) {
  const { data, error } = await db().rpc("confirm_community_bot", {
    p_chat: chatId,
    p_hash: hash(code),
  });
  if (error) throw new Error(`bot link confirmation: ${error.message}`);
  return data === true;
}

export async function unlinkBot(userId: string) {
  const { error } = await db()
    .from("telegram_bot_links")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`bot unlink: ${error.message}`);
}

export async function blockBot(chatId: number) {
  const { error } = await db()
    .from("telegram_bot_links")
    .update({ status: "blocked" })
    .eq("chat_id", chatId)
    .eq("status", "connected");
  if (error) throw new Error(`bot blocked: ${error.message}`);
}

export async function linkedBotChat(userId: string) {
  const { data, error } = await db()
    .from("telegram_bot_links")
    .select("chat_id, users!inner(account_status)")
    .eq("user_id", userId)
    .eq("status", "connected")
    .eq("users.account_status", "active")
    .maybeSingle();
  if (error) throw new Error(`bot delivery lookup: ${error.message}`);
  return data?.chat_id as number | undefined;
}

export async function telegramCall(
  method: "sendMessage" | "answerCallbackQuery",
  body: Record<string, unknown>,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    },
  ).catch(() => null);
  if (!response) return { ok: false, status: 503, retryAfter: 0 };
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { message_id?: number };
    parameters?: { retry_after?: number };
  } | null;
  return {
    ok: response.ok && result?.ok === true,
    status: response.status,
    retryAfter: result?.parameters?.retry_after ?? 0,
    messageId: result?.result?.message_id,
  };
}

export async function botMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
    protect_content: true,
    reply_markup: replyMarkup,
  });
}
