import {
  beginGameBotLink,
  blockBot,
  botMessage,
  botWebhookAllowed,
  confirmBotLink,
  telegramCall,
} from "@/lib/community/bot";
import { notificationsEnabled } from "@/lib/community/notifications";
import {
  attachTelegramPrompt,
  replyFromTelegram,
  smsEnabled,
  telegramPromptToken,
} from "@/lib/community/sms";
import { SocialError } from "@/lib/social/errors";
import { messageFor } from "@/lib/access/messages";

type Chat = { id: number; type: string };
type Update = {
  message?: {
    chat: Chat;
    from?: { id: number };
    text?: string;
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: Chat };
  };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
};

export async function POST(request: Request) {
  if (!notificationsEnabled() || !botWebhookAllowed(request))
    return new Response(null, { status: 404 });
  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return new Response(null, { status: 400 });
  const changed = update.my_chat_member;
  if (
    changed?.chat.type === "private" &&
    changed.new_chat_member?.status === "kicked"
  )
    await blockBot(changed.chat.id);
  const callback = update.callback_query;
  const replyToken = callback?.data?.startsWith("sms:")
    ? callback.data.slice(4)
    : null;
  if (
    smsEnabled() &&
    replyToken &&
    callback?.message?.chat.type === "private" &&
    callback.message.chat.id === callback.from.id
  ) {
    const row = await telegramPromptToken(callback.from.id, replyToken);
    await telegramCall("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: row ? undefined : "Код ответа недействителен.",
    });
    if (row) {
      const prompt = await botMessage(
        callback.from.id,
        "Напишите ответ на это сообщение.",
        { force_reply: true },
      );
      if (prompt.ok && prompt.messageId)
        await attachTelegramPrompt(row.user_id, replyToken, prompt.messageId);
    }
    return new Response(null, { status: 204 });
  }
  const message = update.message;
  if (message?.chat.type !== "private" || message.chat.id !== message.from?.id)
    return new Response(null, { status: 204 });
  const code = /^\/start link_([\w-]{32})$/.exec(message.text ?? "")?.[1];
  if (code) {
    const linked = await confirmBotLink(message.chat.id, code);
    await botMessage(
      message.chat.id,
      linked
        ? "MineOrt подключён. Каналы и тихие часы можно выбрать в кабинете."
        : "Код недействителен. Откройте новую ссылку в кабинете MineOrt из этого аккаунта Telegram.",
    );
  } else if (message.text === "/start") {
    await botMessage(
      message.chat.id,
      "Для подключения откройте «Уведомления» в кабинете MineOrt.",
    );
  } else if (message.text === "/link") {
    const gameCode = await beginGameBotLink(message.chat.id);
    await botMessage(
      message.chat.id,
      gameCode
        ? `Введите в Minecraft /mineort link ${gameCode}. Код действует 5 минут.`
        : "Код сейчас недоступен. Проверьте вход в MineOrt через этот аккаунт Telegram.",
    );
  } else if (
    smsEnabled() &&
    message.reply_to_message?.message_id &&
    message.text
  ) {
    try {
      if (
        await replyFromTelegram(
          message.chat.id,
          message.reply_to_message.message_id,
          message.text,
        )
      )
        await botMessage(message.chat.id, "Ответ отправлен.");
    } catch (error) {
      if (!(error instanceof SocialError)) throw error;
      await botMessage(
        message.chat.id,
        messageFor(error.code) ?? "Не удалось отправить ответ.",
      );
    }
  }
  return new Response(null, { status: 204 });
}
