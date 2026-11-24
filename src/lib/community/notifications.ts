import "server-only";
import { db } from "@/lib/supabase-admin";
import {
  calendarEnabled,
  getEvent,
  eventPath,
  seatHoldSeconds,
} from "@/lib/social/events";
import type { Viewer } from "@/lib/social/viewer";
import { isEnabled } from "@/lib/flags";
import {
  channelEnabled,
  DEFAULT_PREFERENCES,
  type Category,
  type Channel,
  type Preferences,
} from "./preferences";
import {
  commentPath,
  discussionsEnabled,
  getComment,
  type ThreadType,
} from "./discussions";
import { getFeedPost } from "@/lib/social/store";
import { smsEnabled, smsMessage } from "./sms";

export const notificationLabels: Record<string, string> = {
  event_invited: "Вас пригласили на событие",
  event_joined: "Вы записались на событие",
  event_reminder: "Напоминание о событии",
  event_rescheduled: "Событие перенесено",
  event_cancelled: "Событие отменено",
  event_seat: "Для вас освободилось место",
  comment_reply: "Новый ответ или упоминание",
  post_reactions: "Реакции на вашу публикацию",
  sms: "Личное сообщение",
  achievement: "Получено достижение",
  raid_contribution: "Вклад в стройку подтверждён",
};

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  category: Category;
  target_type: string;
  target_id: string;
  due_at: string;
  read_at: string | null;
  removed_at: string | null;
};

export const notificationsEnabled = () =>
  isEnabled("ff_community_notifications");

export async function notificationPreferences(
  userId: string,
): Promise<Preferences> {
  const { data, error } = await db()
    .from("notification_preferences")
    .select(
      "channels, reminder_minutes, timezone, quiet_from, quiet_to, telegram_mode",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`notification preferences: ${error.message}`);
  return (data as Preferences | null) ?? DEFAULT_PREFERENCES;
}

export async function saveNotificationPreferences(
  userId: string,
  preferences: Preferences,
) {
  const { error } = await db().rpc("save_community_preferences", {
    p_user: userId,
    p_channels: preferences.channels,
    p_reminders: preferences.reminder_minutes,
    p_timezone: preferences.timezone,
    p_quiet_from: preferences.quiet_from,
    p_quiet_to: preferences.quiet_to,
    p_mode: preferences.telegram_mode,
  });
  if (error)
    throw new Error(`notification preferences update: ${error.message}`);
}

export async function mutedScopes(userId: string) {
  const { data, error } = await db()
    .from("notification_mutes")
    .select("scope")
    .eq("user_id", userId);
  if (error) throw new Error(`notification mutes: ${error.message}`);
  return new Set<string>(data.map((row) => row.scope));
}

export function visibleOnChannel(
  notification: Notification,
  preferences: Preferences,
  muted: Set<string>,
  channel: Channel,
) {
  return (
    !notification.removed_at &&
    channelEnabled(
      preferences,
      notification.category,
      channel,
      notification.kind,
    ) &&
    !muted.has(`category:${notification.category}`) &&
    !muted.has(`${notification.target_type}:${notification.target_id}`)
  );
}

type NotificationTarget = {
  title: string;
  href: string;
  deadline: string | null;
  scope: string;
  reply?: { type: ThreadType; targetId: string; commentId: string };
};

export async function notificationTarget(
  notification: Notification,
  viewer: Viewer,
): Promise<NotificationTarget | null> {
  if (!viewer.userId) return null;
  if (notification.target_type === "sms" && smsEnabled() && viewer.userId) {
    const sms = await smsMessage(viewer.userId, notification.target_id, true);
    if (!sms) return null;
    return {
      title: `От ${sms.sender}`,
      href: `/dashboard/messages#sms-${sms.id}`,
      deadline: null,
      scope: `dialog:${sms.sender_id}`,
    };
  }
  if (notification.target_type === "comment" && discussionsEnabled()) {
    const comment = await getComment(viewer, notification.target_id);
    if (!comment) return null;
    return {
      title: "Открыть ответ",
      href: commentPath(comment),
      deadline: null,
      scope: `${comment.target_type}:${comment.target_id}`,
      reply: {
        type: comment.target_type,
        targetId: comment.target_id,
        commentId: comment.id,
      },
    };
  }
  if (notification.target_type === "post" && discussionsEnabled()) {
    const post = await getFeedPost(viewer, notification.target_id);
    if (!post) return null;
    return {
      title: "Открыть публикацию",
      href: `/social/post/${post.id}`,
      deadline: null,
      scope: `post:${post.id}`,
    };
  }
  if (
    notification.target_type === "progress" &&
    isEnabled("ff_community_progress") &&
    notification.target_id === viewer.userId
  ) {
    return {
      title: "Ваши достижения",
      href: "/dashboard/progress",
      deadline: null,
      scope: `progress:${viewer.userId}`,
    };
  }
  if (notification.target_type !== "event" || !isEnabled("ff_p1b_social"))
    return null;
  const event = await getEvent(viewer, notification.target_id, false);
  if (!event) return null;
  if (notification.kind === "event_seat" && !event.offeredUntil) return null;
  if (
    notification.kind === "event_reminder" &&
    (event.cancelled ||
      !event.joined ||
      Date.parse(event.startsAt) <= Date.now())
  )
    return null;
  return {
    title: event.title,
    href: calendarEnabled()
      ? eventPath(event.id)
      : `/social/calendar#e-${event.id}`,
    deadline: notification.kind === "event_seat" ? event.offeredUntil : null,
    scope: `event:${event.id}`,
  };
}

export async function inbox(
  viewer: Viewer,
  preferences: Preferences,
  muted: Set<string>,
) {
  const { data, error } = await db()
    .from("community_notifications")
    .select("*")
    .eq("user_id", viewer.userId)
    .is("removed_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`notification inbox: ${error.message}`);
  const relevant = (data as Notification[]).filter((item) =>
    visibleOnChannel(item, preferences, muted, "site"),
  );
  const items = await Promise.all(
    relevant.slice(0, 50).map(async (item) => ({
      ...item,
      target: await notificationTarget(item, viewer),
    })),
  );
  return items.filter((item) => item.target && !muted.has(item.target.scope));
}

export async function maintainWaitlists() {
  if (!isEnabled("ff_community_events") || !isEnabled("ff_p1b_social")) return;
  const { error } = await db().rpc("event_maintain_waitlists", {
    p_hold_seconds: seatHoldSeconds(),
  });
  if (error) throw new Error(`event waitlists: ${error.message}`);
}
