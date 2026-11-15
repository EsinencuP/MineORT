import Link from "next/link";
import type { ReactNode } from "react";
import {
  redeemInvitationAction,
  reserveNickAction,
  submitApplicationAction,
  withdrawApplicationAction,
} from "@/app/actions/access";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { messageFor } from "@/lib/access/messages";
import { MinecraftAvatar } from "./minecraft-avatar";
import { NickField } from "./nick-field";
import { StepIndicator, type StepState } from "./step-indicator";
import { TelegramIcon } from "./telegram-icon";

export type OnboardingProps = {
  profile: { name: string; username: string | null };
  nick: string | null;
  nickLocked: boolean;
  rulesAccepted: boolean;
  invitePrefill: string | null;
  application: {
    status: "pending" | "approved" | "rejected" | "withdrawn";
    reason?: string | null;
    retryOn?: string | null;
  } | null;
  viaInvitation: boolean;
  membershipApproved: boolean;
  whitelistApplied: boolean;
  error: string | null;
  ok: string | null;
  supportContact?: string | null;
  /** Design preview: buttons are disabled, nothing is submitted. */
  preview?: boolean;
  /** Design preview only: pre-typed nickname and an expanded application form. */
  previewNick?: string;
  openApplication?: boolean;
  /** Bridge server state; "unknown" = no game server is registered with the site yet. */
  serverState?: "online" | "offline" | "paused" | "unknown";
};

const NICK_ERRORS = new Set([
  "nick_invalid_format",
  "nick_taken",
  "nick_quarantined",
  "nick_locked",
]);
const OK_TEXT: Record<string, string> = {
  nick: "Ник сохранён.",
  invite: "Приглашение принято.",
  applied: "Заявка отправлена.",
  withdrawn: "Заявка отозвана.",
  rules: "Правила приняты.",
};

function RulesCheckbox({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        name="rules"
        required
        className="mt-0.5 size-5 shrink-0 accent-[color:var(--brand-600)]"
      />
      <span>
        Я ознакомился с{" "}
        <Link
          href="/rules"
          target="_blank"
          className="text-brand-700 underline underline-offset-4"
        >
          правилами сервера
        </Link>
      </span>
    </label>
  );
}

const TicketIcon = (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M3 6h18v4h-2v4h2v4H3v-4h2v-4H3zm6 2v8h2V8zm4 0v2h2V8zm0 3v2h2v-2zm0 3v2h2v-2z" />
  </svg>
);
const DocIcon = (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="currentColor"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M5 2h10l4 4v16H5zm9 1.5V7h3.5zM8 11v2h8v-2zm0 4v2h8v-2zm0-8v2h4V7z" />
  </svg>
);

function IconBadge({ children }: { children: ReactNode }) {
  return (
    <span className="bg-brand-50 text-brand-700 flex size-11 shrink-0 items-center justify-center rounded-2xl">
      {children}
    </span>
  );
}

export function OnboardingView(p: OnboardingProps) {
  const err = p.error;
  const nickError = err && NICK_ERRORS.has(err) ? messageFor(err) : null;
  const globalError = err && !NICK_ERRORS.has(err) ? messageFor(err) : null;
  const hasNick = !!p.nick;
  const pending = p.application?.status === "pending";
  const rejected =
    p.application?.status === "rejected" && !p.membershipApproved;
  const approved = p.membershipApproved;
  const ready = approved && p.whitelistApplied;
  const disabled = !!p.preview;

  const steps: { label: string; state: StepState }[] = [
    { label: "Telegram", state: "done" },
    { label: "Minecraft", state: hasNick ? "done" : "current" },
    { label: "Доступ", state: ready ? "done" : hasNick ? "current" : "todo" },
  ];

  const heading = !hasNick
    ? "Отлично! Теперь подключим Minecraft"
    : ready
      ? "Всё готово: можно подключаться"
      : approved
        ? "Доступ одобрен"
        : pending
          ? "Заявка на рассмотрении"
          : rejected
            ? "Заявка отклонена"
            : "Осталось получить доступ";
  const sub = !hasNick
    ? "Укажи свой игровой ник, чтобы мы могли подготовить доступ на сервер."
    : ready
      ? "Сервер подтвердил твой допуск. Осталось установить игру и зайти."
      : approved
        ? "Сервер ещё применяет твой допуск. Мы покажем «Можно подключаться», когда он подтвердит."
        : pending
          ? "Администрация рассмотрит заявку. Мы сообщим о решении."
          : rejected
            ? "Решение принято, но ты можешь попробовать снова позже."
            : "Выбери, как попасть на сервер: по приглашению или заявкой.";

  // status line for the final step
  const timeline: { label: string; state: StepState }[] = [
    {
      label: p.viaInvitation ? "Приглашение принято" : "Заявка отправлена",
      state: "done",
    },
    ...(p.viaInvitation
      ? []
      : [
          {
            label: "Ожидается решение администрации",
            state: (pending ? "current" : "done") as StepState,
          },
        ]),
    { label: "Доступ одобрен", state: approved ? "done" : "todo" },
    {
      label:
        p.serverState === "unknown"
          ? "Whitelist: ждём запуска сервера"
          : "Whitelist синхронизируется",
      state: approved ? (p.whitelistApplied ? "done" : "current") : "todo",
    },
    { label: "Можно подключаться", state: ready ? "done" : "todo" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <StepIndicator steps={steps} />

      <header className="mt-8">
        <h1 className="text-[clamp(1.9rem,5vw,3rem)] leading-tight">
          {heading}
        </h1>
        <p className="text-ink-muted mt-3 max-w-xl text-base">{sub}</p>
      </header>

      {globalError && (
        <p
          role="alert"
          className="bg-danger-bg text-danger mt-5 rounded-2xl px-4 py-3 text-sm font-medium"
        >
          {globalError}
        </p>
      )}
      {!err && p.ok && (
        <p
          role="status"
          className="bg-ok-bg text-ok mt-5 rounded-2xl px-4 py-3 text-sm font-medium"
        >
          {OK_TEXT[p.ok] ?? "Готово."}
        </p>
      )}

      {/* Telegram profile */}
      <Card
        className="mt-6 flex items-center gap-4"
        aria-label="Профиль Telegram"
      >
        <span className="bg-tg flex size-12 shrink-0 items-center justify-center rounded-full text-white">
          <TelegramIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.profile.name}</p>
          <p className="text-ink-muted truncate text-sm">
            {p.profile.username
              ? `@${p.profile.username}`
              : "Telegram привязан"}
          </p>
        </div>
        <StatusBadge tone="ok">Telegram привязан</StatusBadge>
      </Card>

      {/* Nickname */}
      {!hasNick ? (
        <Card className="mt-5">
          <form action={reserveNickAction} className="flex flex-col gap-4">
            <input
              type="hidden"
              name="return_to"
              value={
                p.invitePrefill
                  ? `/onboarding/minecraft?code=${encodeURIComponent(p.invitePrefill)}`
                  : "/onboarding/minecraft"
              }
            />
            <NickField
              defaultValue={p.previewNick ?? ""}
              serverError={nickError}
            />
            <Button type="submit" disabled={disabled} className="self-start">
              Продолжить
            </Button>
          </form>
        </Card>
      ) : (
        <Card
          className="mt-5 flex flex-wrap items-center gap-4"
          aria-label="Игровой ник"
        >
          <MinecraftAvatar nick={p.nick} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-ink-muted text-sm">Minecraft-ник</p>
            <p className="font-pixel truncate text-2xl">{p.nick}</p>
          </div>
          <StatusBadge tone="info">
            Подтвердим при первом входе в игру
          </StatusBadge>
          {!p.nickLocked && !pending && (
            <details className="w-full">
              <summary className="text-brand-700 cursor-pointer text-sm font-semibold underline underline-offset-4">
                Изменить ник
              </summary>
              <form
                action={reserveNickAction}
                className="mt-3 flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="return_to"
                  value="/onboarding/minecraft"
                />
                <NickField
                  defaultValue={p.nick ?? ""}
                  serverError={nickError}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={disabled}
                  className="self-start"
                >
                  Сохранить ник
                </Button>
              </form>
            </details>
          )}
        </Card>
      )}

      {/* Access */}
      {hasNick && !approved && !pending && (
        <section aria-labelledby="access-title" className="mt-8">
          <h2 id="access-title" className="text-2xl">
            Как получить доступ?
          </h2>
          {rejected && (
            <div
              role="status"
              className="bg-danger-bg text-danger mt-4 rounded-2xl p-4 text-sm"
            >
              <p className="font-semibold">Заявка отклонена</p>
              {p.application?.reason && (
                <p className="mt-1">Причина: {p.application.reason}</p>
              )}
              {p.application?.retryOn && (
                <p className="mt-1">
                  Новую заявку можно подать с {p.application.retryOn}.
                </p>
              )}
              {p.supportContact && (
                <p className="mt-1">
                  Связь с администрацией: {p.supportContact}
                </p>
              )}
            </div>
          )}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <IconBadge>{TicketIcon}</IconBadge>
              <h3 className="font-pixel text-xl">У меня есть приглашение</h3>
              <p className="text-ink-muted text-sm leading-relaxed">
                Тебя пригласил участник MineOrt? Используй его персональную
                ссылку или код.
              </p>
              <form
                action={redeemInvitationAction}
                className="mt-auto flex flex-col gap-3"
              >
                <input
                  type="hidden"
                  name="return_to"
                  value="/onboarding/minecraft"
                />
                <label htmlFor="invite-code" className="text-sm font-medium">
                  Код приглашения
                </label>
                <input
                  id="invite-code"
                  name="token"
                  defaultValue={p.invitePrefill ?? ""}
                  autoComplete="off"
                  required
                  className="bg-paper text-ink border-line min-h-12 rounded-2xl border px-4 font-mono"
                />
                {!p.rulesAccepted && <RulesCheckbox id="rules-invite" />}
                <Button type="submit" disabled={disabled}>
                  Использовать приглашение
                </Button>
              </form>
            </Card>

            <Card className="flex flex-col gap-3">
              <IconBadge>{DocIcon}</IconBadge>
              <h3 className="font-pixel text-xl">Хочу подать заявку</h3>
              <p className="text-ink-muted text-sm leading-relaxed">
                Нет приглашения? Расскажи немного о себе, и администрация
                рассмотрит заявку.
              </p>
              <details
                className="mt-auto"
                open={p.openApplication || err === "retry_too_soon"}
              >
                <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold underline underline-offset-4">
                  Заполнить заявку
                </summary>
                <form
                  action={submitApplicationAction}
                  className="mt-2 flex flex-col gap-3"
                >
                  <input
                    type="hidden"
                    name="return_to"
                    value="/onboarding/minecraft"
                  />
                  <label htmlFor="why" className="text-sm font-medium">
                    Почему хочешь присоединиться к MineOrt?
                  </label>
                  <textarea
                    id="why"
                    name="why"
                    rows={3}
                    maxLength={600}
                    required
                    className="bg-paper text-ink border-line rounded-2xl border px-4 py-3 text-sm"
                  />
                  <label htmlFor="referrer" className="text-sm font-medium">
                    Кто тебя пригласил или откуда узнал о сервере?{" "}
                    <span className="text-ink-muted">(необязательно)</span>
                  </label>
                  <input
                    id="referrer"
                    name="referrer"
                    maxLength={200}
                    className="bg-paper text-ink border-line min-h-12 rounded-2xl border px-4 text-sm"
                  />
                  {!p.rulesAccepted && <RulesCheckbox id="rules-app" />}
                  <Button type="submit" variant="secondary" disabled={disabled}>
                    Отправить заявку
                  </Button>
                </form>
              </details>
            </Card>
          </div>
          <p className="text-ink-muted mt-3 text-sm">
            Если приглашение не подошло, можно подать обычную заявку.
          </p>
        </section>
      )}

      {/* Status */}
      {hasNick && (pending || approved) && (
        <section aria-labelledby="status-title" className="mt-8">
          <h2 id="status-title" className="text-2xl">
            Статус
          </h2>
          <Card className="mt-4">
            <ol className="flex flex-col gap-4">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                      t.state === "done"
                        ? "border-brand-600 bg-brand-600 text-on-brand"
                        : t.state === "current"
                          ? "border-brand-500 text-brand-700 live-dot"
                          : "border-line text-ink-muted"
                    }`}
                  >
                    {t.state === "done"
                      ? "✓"
                      : t.state === "current"
                        ? "…"
                        : ""}
                  </span>
                  <span
                    className={
                      t.state === "todo" ? "text-ink-muted" : "font-medium"
                    }
                  >
                    {t.label}
                    {t.state === "current" && (
                      <span className="sr-only"> (сейчас)</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {pending && (
              <form
                action={withdrawApplicationAction}
                className="border-line mt-5 border-t pt-4"
              >
                <input
                  type="hidden"
                  name="return_to"
                  value="/onboarding/minecraft"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={disabled}
                  className="min-h-11 text-sm"
                >
                  Отозвать заявку
                </Button>
              </form>
            )}
          </Card>

          {approved && !ready && (
            <div className="mt-6 flex flex-col gap-3">
              <p
                role="status"
                className="bg-info-bg text-info rounded-2xl px-4 py-3 text-sm font-medium"
              >
                {p.serverState === "unknown"
                  ? "Игровой сервер ещё не подключён к сайту. Допуск сохранён: как только сервер заработает, мы добавим тебя в whitelist сами. Сайт и сообщество доступны уже сейчас."
                  : "Сервер ещё применяет твой допуск. Обычно это занимает пару минут. Сайт и сообщество доступны уже сейчас."}
              </p>
              <ButtonLink
                href="/dashboard"
                className="min-h-14 self-start px-8 text-base"
              >
                Перейти в кабинет
              </ButtonLink>
            </div>
          )}

          {ready && (
            <div className="mt-6 flex flex-col gap-3">
              <ButtonLink
                href="/start"
                className="min-h-14 self-start px-8 text-base"
              >
                Как зайти на сервер
              </ButtonLink>
              <p className="text-ink-muted max-w-xl text-sm">
                После первого входа в Minecraft подтвердим, что ник
                действительно твой: понадобится одноразовый код из игры.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
