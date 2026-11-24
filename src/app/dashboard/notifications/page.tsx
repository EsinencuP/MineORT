import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addCommentAction } from "@/app/actions/discussions";
import {
  linkTelegramBotAction,
  readNotificationsAction,
  toggleNotificationMuteAction,
  unlinkTelegramBotAction,
  updateNotificationPreferencesAction,
} from "@/app/actions/notifications";
import { LocalTime } from "@/components/social/local-time";
import { PendingButton } from "@/components/social/pending-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { botStatus, botUsername } from "@/lib/community/bot";
import {
  inbox,
  mutedScopes,
  notificationLabels,
  notificationPreferences,
  notificationsEnabled,
} from "@/lib/community/notifications";
import {
  channelEnabled,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  type Category,
} from "@/lib/community/preferences";
import { getViewer } from "@/lib/social/viewer";

export const metadata = { title: "Уведомления" };
const INPUT = "border-line bg-paper min-h-11 rounded-xl border px-3 text-sm";
const REMINDERS = {
  1440: "За день",
  60: "За час",
  15: "За 15 минут",
  5: "За 5 минут",
};

function MuteButton({ scope, muted }: { scope: string; muted: boolean }) {
  return (
    <form action={toggleNotificationMuteAction}>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="unmute" value={muted ? "1" : "0"} />
      <PendingButton variant="ghost" className="px-3 text-sm">
        {muted ? "Включить" : "Заглушить"}
      </PendingButton>
    </form>
  );
}

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/dashboard/notifications">) {
  if (!notificationsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login?return_to=%2Fdashboard%2Fnotifications");
  const [p, muted, status, feedback] = await Promise.all([
    notificationPreferences(viewer.userId),
    mutedScopes(viewer.userId),
    botStatus(viewer.userId),
    searchParams,
  ]);
  const items = await inbox(viewer, p, muted);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <ButtonLink href="/dashboard" variant="ghost">
          ← Мой MineOrt
        </ButtonLink>
      </div>
      <h1 className="text-3xl">Уведомления</h1>
      <Notice
        error={feedback.error}
        ok={feedback.ok}
        okTexts={{ saved: "Настройки сохранены.", unlinked: "Бот отключён." }}
      />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-pixel text-xl">Входящие</h2>
          {items.some((item) => !item.read_at) && (
            <form action={readNotificationsAction}>
              <input type="hidden" name="id" value="all" />
              <PendingButton variant="ghost" className="text-sm">
                Прочитать всё
              </PendingButton>
            </form>
          )}
        </div>
        {!items.length && (
          <p className="text-ink-muted text-sm">Новых уведомлений пока нет.</p>
        )}
        <ul className="divide-line divide-y">
          {items.map(
            ({ target, ...item }) =>
              target && (
                <li key={item.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {notificationLabels[item.kind] ?? "Обновление MineOrt"}
                    </p>
                    {!item.read_at && (
                      <StatusBadge tone="info">Новое</StatusBadge>
                    )}
                  </div>
                  <Link
                    href={target.href}
                    className="text-brand-700 w-fit text-sm break-words underline"
                  >
                    {target.title}
                  </Link>
                  <p className="text-ink-muted text-xs">
                    <LocalTime iso={item.due_at} />
                    {target.deadline && (
                      <>
                        {" "}
                        · Место до <LocalTime iso={target.deadline} />
                      </>
                    )}
                  </p>
                  {target.reply && viewer.canPublish && (
                    <details>
                      <summary className="text-brand-700 min-h-8 cursor-pointer text-sm">
                        Ответить
                      </summary>
                      <form
                        action={addCommentAction}
                        className="flex flex-col items-start gap-2"
                      >
                        <input
                          type="hidden"
                          name="type"
                          value={target.reply.type}
                        />
                        <input
                          type="hidden"
                          name="target"
                          value={target.reply.targetId}
                        />
                        <input
                          type="hidden"
                          name="parent"
                          value={target.reply.commentId}
                        />
                        <textarea
                          aria-label="Ваш ответ"
                          name="body"
                          required
                          maxLength={1500}
                          rows={3}
                          className="border-line bg-paper w-full rounded-xl border p-3 text-sm"
                        />
                        <PendingButton>Ответить</PendingButton>
                      </form>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!item.read_at && (
                      <form action={readNotificationsAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <PendingButton variant="ghost" className="px-3 text-sm">
                          Прочитано
                        </PendingButton>
                      </form>
                    )}
                    {item.target_type !== "progress" && (
                      <MuteButton scope={target.scope} muted={false} />
                    )}
                  </div>
                </li>
              ),
          )}
        </ul>
      </Card>
      <Card className="flex flex-col items-start gap-3">
        <h2 className="font-pixel text-xl">Telegram</h2>
        <p className="text-ink-muted text-sm">
          {status === "connected"
            ? "Бот подключён."
            : status === "blocked"
              ? "Бот заблокирован в Telegram. Снова откройте диалог и подключите его."
              : status === "pending"
                ? "Подтвердите подключение в Telegram. Код действует пять минут."
                : "Подключите бота, чтобы получать выбранные уведомления."}
        </p>
        {botUsername() && (
          <form
            action={
              status === "connected"
                ? unlinkTelegramBotAction
                : linkTelegramBotAction
            }
          >
            <PendingButton
              variant={status === "connected" ? "ghost" : "primary"}
            >
              {status === "connected"
                ? "Отключить бота"
                : status === "blocked"
                  ? "Подключить заново"
                  : "Подключить бота"}
            </PendingButton>
          </form>
        )}
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="font-pixel text-xl">Каналы доставки</h2>
        <form
          action={updateNotificationPreferencesAction}
          className="flex flex-col gap-4"
        >
          {Object.entries(NOTIFICATION_CATEGORIES).map(([key, label]) => {
            const category = key as Category;
            return (
              <fieldset key={key} className="border-line rounded-xl border p-3">
                <legend className="px-1 text-sm font-semibold">{label}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(["site", "telegram", "minecraft"] as const).map(
                    (channel) => (
                      <label
                        key={channel}
                        className="flex min-h-8 items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name={`${category}:${channel}`}
                          defaultChecked={channelEnabled(p, category, channel)}
                        />
                        {
                          {
                            site: "Сайт",
                            telegram: "Telegram",
                            minecraft: "Minecraft",
                          }[channel]
                        }
                      </label>
                    ),
                  )}
                </div>
                <details className="mt-2">
                  <summary className="text-brand-700 cursor-pointer py-1 text-sm">
                    Настроить по типам
                  </summary>
                  {Object.entries(NOTIFICATION_TYPES)
                    .filter(([, [group]]) => group === category)
                    .map(([kind, [, title]]) => (
                      <fieldset
                        key={kind}
                        className="border-line mt-2 rounded-xl border p-2"
                      >
                        <legend className="px-1 text-sm">{title}</legend>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(["site", "telegram", "minecraft"] as const).map(
                            (channel) => {
                              const override =
                                p.channels[
                                  kind as keyof typeof NOTIFICATION_TYPES
                                ]?.[channel];
                              return (
                                <label
                                  className="flex min-w-0 flex-col gap-1 text-xs"
                                  key={channel}
                                >
                                  {
                                    {
                                      site: "Сайт",
                                      telegram: "Telegram",
                                      minecraft: "Minecraft",
                                    }[channel]
                                  }
                                  <select
                                    className={INPUT}
                                    name={`${kind}:${channel}`}
                                    defaultValue={
                                      override === undefined
                                        ? ""
                                        : override
                                          ? "on"
                                          : "off"
                                    }
                                  >
                                    <option value="">Как в категории</option>
                                    <option value="on">Включить</option>
                                    <option value="off">Выключить</option>
                                  </select>
                                </label>
                              );
                            },
                          )}
                        </div>
                      </fieldset>
                    ))}
                </details>
              </fieldset>
            );
          })}
          <fieldset className="border-line rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">
              Напоминания о событиях
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(REMINDERS)
                .reverse()
                .map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-8 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="reminder"
                      value={value}
                      defaultChecked={p.reminder_minutes.includes(
                        Number(value),
                      )}
                    />{" "}
                    {label}
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Часовой пояс (IANA)
              <input
                className={INPUT}
                name="timezone"
                defaultValue={p.timezone}
                required
                maxLength={64}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Доставка в Telegram
              <select
                className={INPUT}
                name="telegram_mode"
                defaultValue={p.telegram_mode}
              >
                <option value="instant">Сразу</option>
                <option value="digest">Дайджест после 18:00</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Тихие часы с
              <input
                type="time"
                className={INPUT}
                name="quiet_from"
                defaultValue={p.quiet_from?.slice(0, 5)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Тихие часы до
              <input
                type="time"
                className={INPUT}
                name="quiet_to"
                defaultValue={p.quiet_to?.slice(0, 5)}
              />
            </label>
          </div>
          <PendingButton className="self-start">
            Сохранить настройки
          </PendingButton>
        </form>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="font-pixel text-xl">Заглушённые темы</h2>
        {[...muted].map((scope) => (
          <div
            key={scope}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm">
              {scope.startsWith("category:")
                ? NOTIFICATION_CATEGORIES[scope.slice(9) as Category]
                : "Обсуждение или событие"}
            </span>
            <MuteButton scope={scope} muted />
          </div>
        ))}
        {Object.entries(NOTIFICATION_CATEGORIES)
          .filter(([key]) => !muted.has(`category:${key}`))
          .map(([key, label]) => (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm">{label}</span>
              <MuteButton scope={`category:${key}`} muted={false} />
            </div>
          ))}
      </Card>
    </div>
  );
}
