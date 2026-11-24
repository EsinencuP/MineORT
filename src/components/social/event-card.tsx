import Link from "next/link";
import {
  cancelEventAction,
  joinEventAction,
  leaveEventAction,
  rescheduleEventAction,
  waitlistEventAction,
} from "@/app/actions/social";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EVENT_CATEGORIES, type EventView } from "@/lib/social/events";
import type { Viewer } from "@/lib/social/viewer";
import { LocalDateTimeInput } from "./local-datetime-input";
import { LocalTime } from "./local-time";
import { PendingButton } from "./pending-button";

export function EventCard({
  event: e,
  viewer,
  back,
  advanced = false,
  detail = false,
  mapHref,
}: {
  event: EventView;
  viewer: Viewer;
  back: string;
  advanced?: boolean;
  detail?: boolean;
  mapHref?: string;
}) {
  const full =
    e.seatsLimit !== null && e.attendees + e.reserved >= e.seatsLimit;
  const open = !e.cancelled && !e.past;
  const signupOpen = open && !e.started;
  const waiting = advanced && e.waiting;
  return (
    <Card
      id={`e-${e.id}`}
      className="flex scroll-mt-24 flex-col gap-3"
      data-event-id={e.id}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3
          className={`font-pixel min-w-0 flex-1 text-xl leading-snug break-words ${e.cancelled ? "line-through opacity-70" : ""}`}
        >
          {e.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge tone="info">{EVENT_CATEGORIES[e.category]}</StatusBadge>
          {e.cancelled && <StatusBadge tone="danger">Отменено</StatusBadge>}
          {!e.cancelled && e.past && <StatusBadge>Прошло</StatusBadge>}
          {e.rescheduledFrom && open && (
            <StatusBadge tone="warn">Перенесено</StatusBadge>
          )}
        </div>
      </header>

      <p className="text-sm">
        <LocalTime iso={e.startsAt} className="font-semibold" />{" "}
        {advanced ? (
          <>
            — <LocalTime iso={e.endsAt} />
          </>
        ) : (
          <>
            {" "}
            ·{" "}
            {e.durationMinutes >= 60
              ? `${Math.floor(e.durationMinutes / 60)} ч${e.durationMinutes % 60 ? ` ${e.durationMinutes % 60} мин` : ""}`
              : `${e.durationMinutes} мин`}
          </>
        )}
      </p>
      {e.rescheduledFrom && open && (
        <p className="text-ink-muted text-xs">
          Раньше: <LocalTime iso={e.rescheduledFrom} />
        </p>
      )}
      {e.place && (
        <p className="text-sm">
          <span className="text-ink-muted">Место: </span>
          {e.place}
        </p>
      )}
      {e.description && (
        <p className="text-sm leading-relaxed break-words whitespace-pre-line">
          {e.description}
        </p>
      )}
      {e.cancelled && e.cancelReason && (
        <p className="text-sm">Причина отмены: {e.cancelReason}</p>
      )}
      {advanced && (
        <div className="flex flex-wrap gap-x-4 text-sm">
          {!detail && (
            <Link
              href={`/social/calendar/${e.id}`}
              className="text-brand-700 inline-flex min-h-11 items-center underline"
            >
              О событии
            </Link>
          )}
          {mapHref && (
            <Link
              href={mapHref}
              className="text-brand-700 inline-flex min-h-11 items-center underline"
            >
              Место в атласе
            </Link>
          )}
          <a
            href={`/api/calendar/event/${e.id}`}
            className="text-brand-700 inline-flex min-h-11 items-center underline"
          >
            Добавить в календарь
          </a>
        </div>
      )}
      <p className="text-ink-muted text-xs">
        Организатор: {e.organizerName} · записалось {e.attendees}
        {e.seatsLimit ? ` из ${e.seatsLimit}` : ""}
        {e.attendees === 0 && " — пока никто не записался"}
      </p>

      {open && (
        <div className="flex flex-wrap items-center gap-2">
          {e.joined ? (
            <>
              <StatusBadge tone="ok">Вы записаны</StatusBadge>
              <form action={leaveEventAction}>
                <input type="hidden" name="event_id" value={e.id} />
                <input type="hidden" name="return_to" value={back} />
                <PendingButton
                  variant="ghost"
                  className="min-h-11 px-4 text-sm"
                  pendingText="Отменяем…"
                >
                  Отменить запись
                </PendingButton>
              </form>
            </>
          ) : viewer.canPublish &&
            signupOpen &&
            (waiting || (advanced && full)) ? (
            <>
              {waiting && (
                <StatusBadge tone={e.offeredUntil ? "ok" : "info"}>
                  {e.offeredUntil ? (
                    <>
                      Место до <LocalTime iso={e.offeredUntil} />
                    </>
                  ) : (
                    "Вы в листе ожидания"
                  )}
                </StatusBadge>
              )}
              <form
                action={waitlistEventAction}
                className="flex flex-wrap gap-2"
              >
                <input type="hidden" name="event_id" value={e.id} />
                <input type="hidden" name="return_to" value={back} />
                {!waiting && (
                  <PendingButton
                    name="event_action"
                    value="waitlist"
                    pendingText="Добавляем…"
                  >
                    Встать в очередь
                  </PendingButton>
                )}
                {e.offeredUntil && (
                  <PendingButton
                    name="event_action"
                    value="confirm"
                    pendingText="Подтверждаем…"
                  >
                    Подтвердить место
                  </PendingButton>
                )}
                {waiting && (
                  <PendingButton
                    name="event_action"
                    value="leave_waitlist"
                    variant="ghost"
                    pendingText="Отменяем…"
                  >
                    Выйти из очереди
                  </PendingButton>
                )}
              </form>
            </>
          ) : viewer.canPublish && signupOpen ? (
            <form action={joinEventAction}>
              <input type="hidden" name="event_id" value={e.id} />
              <input type="hidden" name="return_to" value={back} />
              <PendingButton
                className="min-h-11 px-5 text-sm"
                disabled={full}
                pendingText="Записываем…"
              >
                {full ? "Мест нет" : "Записаться"}
              </PendingButton>
            </form>
          ) : !viewer.canPublish ? (
            <span className="text-ink-muted text-sm">
              Записаться могут участники сервера.
            </span>
          ) : null}

          {e.canManage && (
            <div className="ml-auto flex flex-wrap gap-1">
              <details className="relative">
                <summary className="hover:bg-brand-50 flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold">
                  Перенести
                </summary>
                <form
                  action={rescheduleEventAction}
                  className="border-line bg-paper absolute right-0 z-10 mt-1 flex w-72 max-w-[80vw] flex-col gap-3 rounded-2xl border p-3 shadow-[var(--shadow-card)]"
                >
                  <input type="hidden" name="event_id" value={e.id} />
                  <input type="hidden" name="return_to" value={back} />
                  <LocalDateTimeInput label="Новое время" withZone={false} />
                  <PendingButton
                    className="min-h-11 text-sm"
                    pendingText="Переносим…"
                  >
                    Перенести
                  </PendingButton>
                </form>
              </details>
              <details className="relative">
                <summary className="text-danger hover:bg-danger-bg flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm font-semibold">
                  Отменить событие
                </summary>
                <form
                  action={cancelEventAction}
                  className="border-line bg-paper absolute right-0 z-10 mt-1 flex w-72 max-w-[80vw] flex-col gap-3 rounded-2xl border p-3 shadow-[var(--shadow-card)]"
                >
                  <input type="hidden" name="event_id" value={e.id} />
                  <input type="hidden" name="return_to" value={back} />
                  <label className="text-sm font-medium" htmlFor={`c-${e.id}`}>
                    Причина
                  </label>
                  <input
                    id={`c-${e.id}`}
                    name="reason"
                    className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm"
                  />
                  <PendingButton
                    variant="danger"
                    className="min-h-11 text-sm"
                    pendingText="Отменяем…"
                  >
                    Отменить событие
                  </PendingButton>
                </form>
              </details>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
