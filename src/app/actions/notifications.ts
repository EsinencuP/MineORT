"use server";

import { notFound, redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth/session-policy";
import { beginBotLink, unlinkBot } from "@/lib/community/bot";
import {
  notificationsEnabled,
  saveNotificationPreferences,
} from "@/lib/community/notifications";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  type Category,
  type Preferences,
} from "@/lib/community/preferences";
import {
  calendarSubscriptionConfigured,
  changeCalendarSubscription,
} from "@/lib/social/calendar-token";
import { calendarEnabled, EVENT_ID } from "@/lib/social/events";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

const BACK = "/dashboard/notifications";

async function notificationsUser() {
  if (!notificationsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  return viewer.userId;
}

export async function updateCalendarSubscriptionAction(form: FormData) {
  if (!calendarEnabled() || !calendarSubscriptionConfigured()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  await changeCalendarSubscription(
    viewer.userId,
    form.get("operation") === "revoke",
  );
  redirect("/dashboard/calendar");
}

export async function updateNotificationPreferencesAction(form: FormData) {
  const userId = await notificationsUser();
  const timezone = String(form.get("timezone") || "");
  try {
    new Intl.DateTimeFormat("ru", { timeZone: timezone });
  } catch {
    redirect(`${BACK}?error=notification_invalid`);
  }
  const from = String(form.get("quiet_from") || "");
  const to = String(form.get("quiet_to") || "");
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if ((from || to) && (!time.test(from) || !time.test(to)))
    redirect(`${BACK}?error=notification_invalid`);
  const channels: Preferences["channels"] = {};
  for (const category of Object.keys(NOTIFICATION_CATEGORIES) as Category[]) {
    channels[category] = {
      site: form.has(`${category}:site`),
      telegram: form.has(`${category}:telegram`),
      minecraft: form.has(`${category}:minecraft`),
    };
  }
  for (const kind of Object.keys(
    NOTIFICATION_TYPES,
  ) as (keyof typeof NOTIFICATION_TYPES)[]) {
    const overrides: NonNullable<Preferences["channels"][typeof kind]> = {};
    for (const channel of ["site", "telegram", "minecraft"] as const) {
      const choice = form.get(`${kind}:${channel}`);
      if (choice === "on" || choice === "off")
        overrides[channel] = choice === "on";
    }
    if (Object.keys(overrides).length) channels[kind] = overrides;
  }
  await saveNotificationPreferences(userId, {
    channels,
    timezone,
    quiet_from: from || null,
    quiet_to: to || null,
    reminder_minutes: [1440, 60, 15, 5].filter((offset) =>
      form.getAll("reminder").includes(String(offset)),
    ),
    telegram_mode:
      form.get("telegram_mode") === "digest" ? "digest" : "instant",
  });
  redirect(`${BACK}?ok=saved`);
}

export async function readNotificationsAction(form: FormData) {
  const userId = await notificationsUser();
  const id = form.get("id");
  const readAt = new Date().toISOString();
  let query = db()
    .from("community_notifications")
    .update({ read_at: readAt })
    .eq("user_id", userId)
    .is("read_at", null)
    .lte("due_at", readAt);
  if (typeof id === "string" && EVENT_ID.test(id)) query = query.eq("id", id);
  else if (id !== "all") return;
  const { error } = await query;
  if (error) throw new Error(`read notifications: ${error.message}`);
  redirect(BACK);
}

export async function toggleNotificationMuteAction(form: FormData) {
  const userId = await notificationsUser();
  const scope = String(form.get("scope") || "");
  const [type, target, more] = scope.split(":");
  if (
    more ||
    !(type === "category"
      ? Object.hasOwn(NOTIFICATION_CATEGORIES, target)
      : ["event", "post", "project", "guild", "sms", "dialog"].includes(type) &&
        EVENT_ID.test(target))
  )
    return;
  const table = db().from("notification_mutes");
  const { error } =
    form.get("unmute") === "1"
      ? await table.delete().eq("user_id", userId).eq("scope", scope)
      : await table.upsert({ user_id: userId, scope });
  if (error) throw new Error(`notification mute: ${error.message}`);
  redirect(safeReturnTo(String(form.get("return_to") || BACK)));
}

export async function linkTelegramBotAction() {
  const url = await beginBotLink(await notificationsUser());
  redirect(url ?? `${BACK}?error=notification_bot_unavailable`);
}

export async function unlinkTelegramBotAction() {
  await unlinkBot(await notificationsUser());
  redirect(`${BACK}?ok=unlinked`);
}
