import type { Metadata } from "next";
import Link from "next/link";
import {
  castVoteAction,
  closePollAction,
  createPollAction,
} from "@/app/actions/social";
import { Countdown } from "@/components/portal/countdown";
import { LocalDateTimeInput } from "@/components/social/local-datetime-input";
import { PendingButton } from "@/components/social/pending-button";
import { PollOptionsInput } from "@/components/social/poll-options-input";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import { listPolls, type PollView } from "@/lib/social/polls";
import { getViewer, type Viewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Голосования" };

const OK_TEXTS = {
  created: "Голосование создано.",
  voted: "Ваш голос учтён.",
  changed: "Голос изменён.",
  closed: "Голосование закрыто, итоги опубликованы.",
};

function Results({ poll }: { poll: PollView }) {
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const total = poll.options.reduce((s, o) => s + o.votes, 0) || 1;
  return (
    <ul className="flex flex-col gap-2" aria-label="Результаты">
      {poll.options.map((o) => (
        <li key={o.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">
              {o.label}
              {poll.myOptionIds.includes(o.id) && (
                <span className="text-brand-700 ml-2 text-xs font-semibold">
                  ваш голос
                </span>
              )}
            </span>
            <span className="text-ink-muted shrink-0">
              {o.votes} · {Math.round((o.votes / total) * 100)}%
            </span>
          </div>
          <div className="bg-line h-2.5 overflow-hidden rounded-full">
            <div
              className="bg-brand-500 h-full rounded-full"
              style={{ width: `${(o.votes / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function VoteForm({ poll, change }: { poll: PollView; change: boolean }) {
  const type = poll.multiChoice ? "checkbox" : "radio";
  return (
    <form action={castVoteAction} className="flex flex-col gap-3">
      <input type="hidden" name="poll_id" value={poll.id} />
      {change && <input type="hidden" name="change" value="1" />}
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">
          {poll.multiChoice
            ? `Выберите до ${poll.maxChoices ?? poll.options.length} вариантов`
            : "Выберите один вариант"}
        </legend>
        {poll.options.map((o) => (
          <label
            key={o.id}
            className="border-line hover:bg-brand-50 has-[:checked]:border-brand-600 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2"
          >
            <input
              type={type}
              name="choice"
              value={o.id}
              required={!poll.multiChoice}
              defaultChecked={change && poll.myOptionIds.includes(o.id)}
              className="size-5 shrink-0 accent-[color:var(--brand-600)]"
            />
            <span className="break-words">{o.label}</span>
          </label>
        ))}
      </fieldset>
      {poll.multiChoice && (
        <p className="text-ink-muted text-xs">
          Можно выбрать до {poll.maxChoices ?? poll.options.length} вариантов.
        </p>
      )}
      <PendingButton className="self-start" pendingText="Отправляем голос…">
        {change ? "Изменить голос" : "Проголосовать"}
      </PendingButton>
    </form>
  );
}

function PollCard({ poll, viewer }: { poll: PollView; viewer: Viewer }) {
  const voted = poll.myOptionIds.length > 0;
  return (
    <Card className="flex flex-col gap-4" data-poll-id={poll.id}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-pixel min-w-0 flex-1 text-xl leading-snug break-words">
          {poll.question}
        </h2>
        {poll.closed ? (
          <StatusBadge>
            {poll.closedEarly ? "Закрыто досрочно" : "Завершено"}
          </StatusBadge>
        ) : (
          <StatusBadge tone="ok">Идёт</StatusBadge>
        )}
      </header>
      <p className="text-ink-muted text-sm">
        {poll.closed ? (
          <>
            Итоги опубликованы
            {poll.showResults && ` · проголосовали: ${poll.totalVoters}`}
          </>
        ) : (
          <>
            До конца: <Countdown target={poll.closesAt} />
            {poll.showResults && ` · проголосовали: ${poll.totalVoters}`}
          </>
        )}
      </p>

      {poll.showResults ? (
        <Results poll={poll} />
      ) : !poll.closed && !voted ? (
        viewer.canPublish ? (
          <VoteForm poll={poll} change={false} />
        ) : viewer.cls === "restricted" ? (
          <p className="text-ink-muted text-sm">
            Допуск приостановлен: голосовать нельзя.
          </p>
        ) : (
          <p className="border-line bg-surface rounded-xl border p-3 text-sm">
            Голосовать могут участники сервера.{" "}
            <Link
              href="/onboarding/minecraft"
              className="text-brand-700 font-semibold underline underline-offset-4"
            >
              Получить допуск
            </Link>
          </p>
        )
      ) : null}

      {!poll.closed && voted && (
        <div className="flex flex-col gap-3">
          <StatusBadge tone="ok">Ваш голос учтён</StatusBadge>
          {poll.resultsAfterClose && (
            <p className="text-ink-muted text-sm">
              Результаты появятся после завершения голосования.
            </p>
          )}
          {poll.allowChange && (
            <details>
              <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold underline underline-offset-4">
                Изменить голос
              </summary>
              <div className="mt-2">
                <VoteForm poll={poll} change />
              </div>
            </details>
          )}
        </div>
      )}

      <footer className="border-line flex flex-wrap items-center gap-3 border-t pt-3">
        <p className="text-ink-muted flex-1 text-xs">
          Результат носит рекомендательный характер · автор: {poll.authorName}
        </p>
        {viewer.canModerate && !poll.closed && (
          <form action={closePollAction}>
            <input type="hidden" name="poll_id" value={poll.id} />
            <PendingButton
              variant="ghost"
              className="min-h-11 px-4 text-sm"
              pendingText="Закрываем…"
            >
              Закрыть досрочно
            </PendingButton>
          </form>
        )}
      </footer>
    </Card>
  );
}

export default async function PollsPage({
  searchParams,
}: PageProps<"/social/polls">) {
  await requireFlag("ff_p1b_social");
  const sp = await searchParams;
  const viewer = await getViewer();
  const polls =
    viewer.cls === "guest"
      ? []
      : await safely("polls", () => listPolls(viewer), null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Голосования
      </h1>
      <p className="text-ink-muted mt-2">
        Решаем вместе: один голос на игрока, итоги честные.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        {viewer.canModerate && (
          <Card>
            <details>
              <summary className="text-brand-700 min-h-11 cursor-pointer py-2 font-semibold">
                ＋ Новое голосование
              </summary>
              <form
                action={createPollAction}
                className="mt-3 flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q" className="text-sm font-medium">
                    Вопрос
                  </label>
                  <input
                    id="q"
                    name="question"
                    required
                    minLength={3}
                    maxLength={300}
                    className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                  />
                </div>
                <PollOptionsInput />
                <LocalDateTimeInput
                  label="Когда закончится"
                  name="closes_at"
                  withZone={false}
                />
                <fieldset className="flex flex-col gap-1">
                  <legend className="sr-only">Правила</legend>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="multi"
                      className="size-5 accent-[color:var(--brand-600)]"
                    />
                    Можно выбрать несколько вариантов
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="min-w-0">Не больше вариантов:</span>
                    <input
                      type="number"
                      name="max_choices"
                      min={1}
                      max={10}
                      className="bg-paper text-ink border-line min-h-11 w-20 rounded-xl border px-3"
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="allow_change"
                      className="size-5 accent-[color:var(--brand-600)]"
                    />
                    Разрешить менять голос
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="results"
                      value="after_vote"
                      defaultChecked
                      className="size-5 accent-[color:var(--brand-600)]"
                    />
                    Показывать итоги после голоса
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="results"
                      value="after_close"
                      className="size-5 accent-[color:var(--brand-600)]"
                    />
                    Показать итоги только после завершения
                  </label>
                </fieldset>
                <PendingButton className="self-start" pendingText="Создаём…">
                  Создать голосование
                </PendingButton>
              </form>
            </details>
          </Card>
        )}

        {viewer.cls === "guest" ? (
          <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm">
            <p>Голосования видны вошедшим игрокам.</p>
            <ButtonLink href="/login" className="min-h-11 px-5 text-sm">
              Войти через Telegram
            </ButtonLink>
          </div>
        ) : polls === null ? (
          <ErrorState
            title="Не удалось загрузить голосования"
            description="Обновите страницу через минуту."
          />
        ) : polls.length === 0 ? (
          <EmptyState
            title="Голосований пока нет"
            description="Когда модерация запустит первое, оно появится здесь."
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {polls.map((p) => (
              <li key={p.id}>
                <PollCard poll={p} viewer={viewer} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
