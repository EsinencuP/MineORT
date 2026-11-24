import "server-only";
import { db } from "@/lib/supabase-admin";
import { blockBot, botMessage, linkedBotChat } from "./bot";
import {
  mutedScopes,
  notificationLabels,
  notificationPreferences,
  notificationTarget,
  visibleOnChannel,
  type Notification,
} from "./notifications";
import { nextTelegramWindow } from "./preferences";
import type { Viewer } from "@/lib/social/viewer";
import { smsMessage, smsReplyToken } from "./sms";

type Lease = { notification_id: string; lease_id: string; attempts: number };
type Delivery = { lease: Lease; item: Notification };

async function stop(
  lease: Lease,
  state: "delivered" | "stopped" | "retry",
  retry?: Date,
) {
  const now = new Date().toISOString();
  const update =
    state === "delivered"
      ? { delivered_at: now }
      : state === "stopped"
        ? { stopped_at: now }
        : { next_attempt_at: retry!.toISOString() };
  const { error } = await db()
    .from("notification_deliveries")
    .update({ ...update, lease_id: null })
    .eq("notification_id", lease.notification_id)
    .eq("channel", "telegram")
    .eq("lease_id", lease.lease_id);
  if (error)
    throw new Error(`notification delivery acknowledgement: ${error.message}`);
}

async function sendUserBatch(
  userId: string,
  deliveries: Delivery[],
  origin: string,
) {
  const [preferences, muted, chatId] = await Promise.all([
    notificationPreferences(userId),
    mutedScopes(userId),
    linkedBotChat(userId),
  ]);
  const viewer: Viewer = {
    userId,
    cls: "user",
    canPublish: false,
    canModerate: false,
  };
  const now = new Date();
  const messages: { lease: Lease; text: string; item: Notification }[] = [];
  for (const { item, lease } of deliveries) {
    if (!chatId || !visibleOnChannel(item, preferences, muted, "telegram")) {
      await stop(lease, "stopped");
      continue;
    }
    const target = await notificationTarget(item, viewer);
    if (!target || muted.has(target.scope)) {
      await stop(lease, "stopped");
      continue;
    }
    const scheduled = nextTelegramWindow(
      preferences,
      new Date(item.due_at),
      now,
    );
    if (scheduled.getTime() > now.getTime()) {
      await stop(lease, "retry", scheduled);
      continue;
    }
    const deadline = target.deadline
      ? `\nМесто до ${new Intl.DateTimeFormat("ru", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: preferences.timezone,
        }).format(new Date(target.deadline))}`
      : "";
    const text = `${notificationLabels[item.kind] ?? "Обновление MineOrt"}: ${target.title}${deadline}\n${new URL(target.href, origin).href}`;
    messages.push({ lease, text, item });
  }
  if (!chatId) return 0;
  const digest = messages.filter((message) => message.item.kind !== "sms");
  const groups =
    preferences.telegram_mode === "digest"
      ? [
          ...Array.from({ length: Math.ceil(digest.length / 8) }, (_, i) =>
            digest.slice(i * 8, i * 8 + 8),
          ),
          ...messages
            .filter((message) => message.item.kind === "sms")
            .map((message) => [message]),
        ]
      : messages.map((message) => [message]);
  let sent = 0;
  for (const group of groups) {
    // Refresh consent and identity before every external send, including an in-flight batch.
    if ((await linkedBotChat(userId)) !== chatId) {
      await Promise.all(group.map(({ lease }) => stop(lease, "stopped")));
      continue;
    }
    const fresh = await notificationPreferences(userId);
    const nowMuted = await mutedScopes(userId);
    const permitted: typeof messages = [];
    for (const message of group) {
      const { data: current, error } = await db()
        .from("community_notifications")
        .select("removed_at")
        .eq("id", message.item.id)
        .maybeSingle();
      if (error) throw new Error(`notification state: ${error.message}`);
      const target = await notificationTarget(message.item, viewer);
      if (
        !current ||
        current.removed_at ||
        !visibleOnChannel(message.item, fresh, nowMuted, "telegram") ||
        !target ||
        nowMuted.has(target.scope)
      ) {
        await stop(message.lease, "stopped");
      } else permitted.push(message);
    }
    if (!permitted.length) continue;
    const first = permitted[0];
    let response;
    if (first.item.kind === "sms") {
      const message = await smsMessage(userId, first.item.target_id, true);
      if (!message) {
        await stop(first.lease, "stopped");
        continue;
      }
      const token = await smsReplyToken(first.item.id, userId);
      response = await botMessage(
        chatId,
        `${message.sender}: ${message.body}`,
        {
          inline_keyboard: [
            [{ text: "Ответить в Minecraft", callback_data: `sms:${token}` }],
          ],
        },
      );
    } else {
      response = await botMessage(
        chatId,
        (permitted.length > 1 ? "MineOrt · обновления\n\n" : "") +
          permitted.map((message) => message.text).join("\n\n"),
      );
    }
    if (response.ok) sent += permitted.length;
    if (response.status === 403) await blockBot(chatId);
    await Promise.all(
      permitted.map(({ lease }) => {
        if (response.ok) return stop(lease, "delivered");
        if (response.status === 403 || response.status === 400)
          return stop(lease, "stopped");
        const seconds = Math.max(
          response.retryAfter,
          Math.min(3600, 15 * 2 ** Math.min(lease.attempts, 8)),
        );
        return stop(lease, "retry", new Date(Date.now() + seconds * 1000));
      }),
    );
  }
  return sent;
}

export async function deliverTelegramNotifications() {
  const origin = process.env.APP_URL;
  if (!origin || !process.env.TELEGRAM_BOT_TOKEN) return 0;
  const { data: leases, error } = await db().rpc("claim_community_deliveries", {
    p_channel: "telegram",
    p_limit: 6,
  });
  if (error) throw new Error(`claim Telegram notifications: ${error.message}`);
  const ids = (leases as Lease[]).map((lease) => lease.notification_id);
  if (!ids.length) return 0;
  const { data, error: readError } = await db()
    .from("community_notifications")
    .select("*")
    .in("id", ids);
  if (readError)
    throw new Error(`telegram notification lookup: ${readError.message}`);
  const byId = new Map((data as Notification[]).map((item) => [item.id, item]));
  const users = new Map<string, Delivery[]>();
  for (const lease of leases as Lease[]) {
    const item = byId.get(lease.notification_id);
    if (!item) continue;
    const list = users.get(item.user_id) ?? [];
    list.push({ item, lease });
    users.set(item.user_id, list);
  }
  const result = await Promise.all(
    [...users.entries()].map(([userId, deliveries]) =>
      sendUserBatch(userId, deliveries, origin),
    ),
  );
  return result.reduce((sum, count) => sum + count, 0);
}
