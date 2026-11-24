import type { Metadata } from "next";
import Link from "next/link";
import { createEventAction } from "@/app/actions/social";
import { EventCard } from "@/components/social/event-card";
import { LocalDateTimeInput } from "@/components/social/local-datetime-input";
import { PendingButton } from "@/components/social/pending-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { isEnabled, requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import {
  calendarEnabled,
  EVENT_CATEGORIES,
  listEventsBetween,
  listUpcoming,
  type EventView,
} from "@/lib/social/events";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "События" };

const OK_TEXTS = {
  created: "Событие создано.",
  joined: "Вы записаны.",
  left: "Запись отменена.",
  rescheduled: "Событие перенесено.",
  cancelled: "Событие отменено.",
  waitlist: "Вы в листе ожидания.",
  confirm: "Место подтверждено.",
  leave_waitlist: "Вы вышли из очереди.",
};
const COMMUNITY_TZ = "Europe/Chisinau";
const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

/** Calendar day of an instant in the community zone, as YYYY-MM-DD. */
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: COMMUNITY_TZ }).format(d);

function parseMonth(raw: unknown): { y: number; m: number } {
  const now = new Date();
  const fallback = {
    y: Number(dayKey(now).slice(0, 4)),
    m: Number(dayKey(now).slice(5, 7)),
  };
  if (typeof raw !== "string") return fallback;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  return match ? { y: Number(match[1]), m: Number(match[2]) } : fallback;
}

function MonthGrid({
  y,
  m,
  events,
}: {
  y: number;
  m: number;
  events: EventView[];
}) {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const byDay = new Map<string, EventView[]>();
  for (const e of events) {
    const k = dayKey(new Date(e.startsAt));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const today = dayKey(new Date());
  const cells: (number | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  return (
    <div
      className="border-line hidden overflow-hidden rounded-2xl border sm:block"
      role="grid"
      aria-label={`${MONTHS[m - 1]} ${y}`}
    >
      <div
        role="row"
        className="bg-surface grid grid-cols-7 text-center text-xs font-semibold"
      >
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div key={d} role="columnheader" className="text-ink-muted py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const key = day
            ? `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            : "";
          const list = day ? (byDay.get(key) ?? []) : [];
          return (
            <div
              key={i}
              role="gridcell"
              className={`border-line min-h-24 border-t border-l p-1.5 text-xs first:border-l-0 [&:nth-child(7n+1)]:border-l-0 ${
                day ? "" : "bg-surface/50"
              }`}
            >
              {day && (
                <>
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-md font-semibold ${
                      key === today
                        ? "bg-brand-600 text-on-brand"
                        : "text-ink-muted"
                    }`}
                  >
                    {day}
                  </span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {list.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        <a
                          href={`#e-${e.id}`}
                          className={`bg-brand-50 text-brand-700 block truncate rounded px-1.5 py-0.5 font-medium ${e.cancelled ? "line-through opacity-70" : ""}`}
                        >
                          {e.title}
                        </a>
                      </li>
                    ))}
                    {list.length > 3 && (
                      <li className="text-ink-muted px-1.5">
                        ещё {list.length - 3}
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-ink-muted border-line border-t px-3 py-2 text-xs">
        Дни в сетке даны по времени сообщества ({COMMUNITY_TZ}); время в
        карточках — по вашему часовому поясу.
      </p>
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: PageProps<"/social/calendar">) {
  await requireFlag("ff_p1b_social");
  const sp = await searchParams;
  const viewer = await getViewer();
  const advanced = calendarEnabled();
  const month = sp.m !== undefined;
  const { y, m } = parseMonth(sp.m);
  const events =
    !advanced && viewer.cls === "guest"
      ? []
      : await safely(
          "events",
          () =>
            month
              ? listEventsBetween(
                  viewer,
                  new Date(Date.UTC(y, m - 1, 1) - 86_400_000),
                  new Date(Date.UTC(y, m, 1) + 86_400_000),
                ).then((l) =>
                  l.filter((e) =>
                    dayKey(new Date(e.startsAt)).startsWith(
                      `${y}-${String(m).padStart(2, "0")}`,
                    ),
                  ),
                )
              : listUpcoming(viewer),
          null,
        );
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const ym = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const back = month
    ? `/social/calendar?m=${ym(new Date(Date.UTC(y, m - 1, 1)))}`
    : "/social/calendar";
  const tab = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      active
        ? "bg-brand-600 text-on-brand"
        : "border-line hover:bg-brand-50 border"
    }`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        События
      </h1>
      <p className="text-ink-muted mt-2">
        Стройки, встречи и конкурсы. Время показывается в вашем часовом поясе.
      </p>

      <nav
        aria-label="Вид календаря"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <Link
          href="/social/calendar"
          aria-current={!month ? "page" : undefined}
          className={tab(!month)}
        >
          Список
        </Link>
        <Link
          href={`/social/calendar?m=${ym(new Date(Date.UTC(y, m - 1, 1)))}`}
          aria-current={month ? "page" : undefined}
          className={tab(month)}
        >
          Месяц
        </Link>
        {month && (
          <span className="ml-auto flex items-center gap-1">
            <Link
              href={`/social/calendar?m=${ym(prev)}`}
              aria-label="Предыдущий месяц"
              className="hover:bg-brand-50 inline-flex size-11 items-center justify-center rounded-full"
            >
              ←
            </Link>
            <span className="min-w-32 text-center font-semibold">
              {MONTHS[m - 1]} {y}
            </span>
            <Link
              href={`/social/calendar?m=${ym(next)}`}
              aria-label="Следующий месяц"
              className="hover:bg-brand-50 inline-flex size-11 items-center justify-center rounded-full"
            >
              →
            </Link>
          </span>
        )}
      </nav>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />
        {advanced && viewer.userId && (
          <Link
            href="/dashboard/calendar"
            className="text-brand-700 text-sm underline"
          >
            Подписка «Мои события MineOrt»
          </Link>
        )}

        {viewer.canPublish && (
          <Card>
            <details>
              <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
                ＋ Создать событие
              </summary>
              <form
                action={createEventAction}
                className="mt-3 flex flex-col gap-4"
              >
                <input type="hidden" name="return_to" value={back} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ev-title" className="text-sm font-medium">
                    Название
                  </label>
                  <input
                    id="ev-title"
                    name="title"
                    required
                    minLength={3}
                    maxLength={120}
                    className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ev-desc" className="text-sm font-medium">
                    Описание
                  </label>
                  <textarea
                    id="ev-desc"
                    name="description"
                    rows={3}
                    maxLength={2000}
                    className="bg-paper text-ink border-line rounded-xl border px-3 py-2"
                  />
                </div>
                <LocalDateTimeInput label="Начало" />
                {advanced && (
                  <LocalDateTimeInput
                    label="Окончание"
                    name="ends_at"
                    withZone={false}
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {!advanced && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ev-dur" className="text-sm font-medium">
                        Длительность, минут
                      </label>
                      <input
                        id="ev-dur"
                        name="duration"
                        type="number"
                        min={15}
                        max={1440}
                        defaultValue={60}
                        className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ev-seats" className="text-sm font-medium">
                      Лимит мест (необязательно)
                    </label>
                    <input
                      id="ev-seats"
                      name="seats"
                      type="number"
                      min={1}
                      max={500}
                      className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                    />
                  </div>
                  {advanced && (
                    <>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Кто увидит событие
                        <select
                          name="visibility"
                          defaultValue="signed_in"
                          className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                        >
                          <option value="public">Все</option>
                          <option value="signed_in">Вошедшие игроки</option>
                          <option value="guild">Моя гильдия</option>
                          <option value="private">Только я</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Ссылка на метку атласа
                        <input
                          name="marker_id"
                          placeholder="/map?m=…"
                          maxLength={500}
                          className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                        />
                      </label>
                      {isEnabled("ff_community_progress") && (
                        <label className="flex flex-col gap-1.5 text-sm font-medium">
                          Ссылка на ваш проект для рейда
                          <input
                            name="project_id"
                            placeholder="/social/projects/…"
                            maxLength={500}
                            className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                          />
                        </label>
                      )}
                    </>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ev-place" className="text-sm font-medium">
                      Место
                    </label>
                    <input
                      id="ev-place"
                      name="place"
                      maxLength={120}
                      className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ev-cat" className="text-sm font-medium">
                      Категория
                    </label>
                    <select
                      id="ev-cat"
                      name="category"
                      className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                    >
                      {Object.entries(EVENT_CATEGORIES).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <PendingButton className="self-start" pendingText="Создаём…">
                  Создать событие
                </PendingButton>
              </form>
            </details>
          </Card>
        )}

        {!advanced && viewer.cls === "guest" ? (
          <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm">
            <p>Календарь виден вошедшим игрокам.</p>
            <ButtonLink href="/login" className="min-h-11 px-5 text-sm">
              Войти через Telegram
            </ButtonLink>
          </div>
        ) : events === null ? (
          <ErrorState
            title="Не удалось загрузить события"
            description="Обновите страницу через минуту."
          />
        ) : (
          <>
            {month && <MonthGrid y={y} m={m} events={events} />}
            {events.length === 0 ? (
              <EmptyState
                title={month ? "В этом месяце событий нет" : "Событий пока нет"}
                description={
                  viewer.canPublish
                    ? "Создайте первое."
                    : "Как только появятся, они будут здесь."
                }
              />
            ) : (
              <ol className="flex flex-col gap-4">
                {events.map((e) => (
                  <li key={e.id}>
                    <EventCard
                      event={e}
                      viewer={viewer}
                      back={back}
                      advanced={advanced}
                    />
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}
