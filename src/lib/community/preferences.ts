export const NOTIFICATION_CATEGORIES = {
  game: "Игра и чат",
  events: "События",
  guilds: "Гильдии и проекты",
  social: "Лента и атлас",
  progress: "Прогресс и доступ",
} as const;

export type Category = keyof typeof NOTIFICATION_CATEGORIES;
export type Channel = "site" | "telegram" | "minecraft";
export const NOTIFICATION_TYPES = {
  event_invited: ["events", "Приглашение на событие"],
  event_joined: ["events", "Запись на событие"],
  event_reminder: ["events", "Напоминание"],
  event_rescheduled: ["events", "Перенос"],
  event_cancelled: ["events", "Отмена"],
  event_seat: ["events", "Место из очереди"],
  sms: ["game", "Личное сообщение"],
  comment_reply: ["social", "Ответ или упоминание"],
  post_reactions: ["social", "Реакции"],
  raid_contribution: ["guilds", "Подтверждение вклада"],
  achievement: ["progress", "Достижение"],
} as const satisfies Record<string, readonly [Category, string]>;

type NotificationKind = keyof typeof NOTIFICATION_TYPES;
export type Preferences = {
  channels: Partial<
    Record<Category | NotificationKind, Partial<Record<Channel, boolean>>>
  >;
  reminder_minutes: number[];
  timezone: string;
  quiet_from: string | null;
  quiet_to: string | null;
  telegram_mode: "instant" | "digest";
};

export const DEFAULT_PREFERENCES: Preferences = {
  channels: {},
  reminder_minutes: [1440, 15],
  timezone: "Europe/Chisinau",
  quiet_from: null,
  quiet_to: null,
  telegram_mode: "instant",
};

export function channelEnabled(
  preferences: Preferences,
  category: Category,
  channel: Channel,
  kind?: string,
) {
  const specific =
    kind && Object.hasOwn(NOTIFICATION_TYPES, kind)
      ? preferences.channels[kind as NotificationKind]?.[channel]
      : undefined;
  return (
    specific ?? preferences.channels[category]?.[channel] ?? channel === "site"
  );
}

const clockMinutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function nextTelegramWindow(
  preferences: Preferences,
  due: Date,
  now: Date,
) {
  const { quiet_from: from, quiet_to: to, telegram_mode: mode } = preferences;
  if ((!from || !to || from === to) && mode === "instant") return now;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: preferences.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: preferences.timezone,
    dateStyle: "short",
  });
  const start = from ? clockMinutes(from) : 0;
  const end = to ? clockMinutes(to) : 0;
  const quiet = (minute: number) =>
    start <= end
      ? minute >= start && minute < end
      : minute >= start || minute < end;
  const dueDay = date.format(due);
  const dueMinute = clockMinutes(formatter.format(due));
  const digestMinute = 18 * 60;
  let digestDay = dueDay;
  if (dueMinute >= digestMinute) {
    const nextDay = new Date(`${dueDay}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    digestDay = nextDay.toISOString().slice(0, 10);
  }
  for (let i = 0; i <= 3000; i++) {
    const candidate = new Date(now.getTime() + i * 60_000);
    const currentMinute = clockMinutes(formatter.format(candidate));
    if (quiet(currentMinute)) continue;
    if (mode === "instant") return candidate;
    const candidateDay = date.format(candidate);
    if (
      candidateDay > digestDay ||
      (candidateDay === digestDay && currentMinute >= digestMinute)
    )
      return candidate;
  }
  return new Date(now.getTime() + 3_600_000);
}
