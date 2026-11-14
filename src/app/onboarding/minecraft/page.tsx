import type { Metadata } from "next";
import Link from "next/link";
import {
  redeemInvitationAction,
  reserveNickAction,
  submitApplicationAction,
  withdrawApplicationAction,
} from "@/app/actions/access";
import { getAccessOverview } from "@/lib/access/store";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getWhitelistState } from "@/lib/bridge/whitelist";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Допуск на сервер" };

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className="mb-4" aria-label={title}>
      <div className="mb-2 flex items-center gap-3">
        <h2 className="text-lg font-semibold">
          {n}. {title}
        </h2>
        {done && <StatusBadge tone="ok">Готово</StatusBadge>}
      </div>
      {children}
    </Card>
  );
}

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding/minecraft">) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="mb-3 text-2xl font-bold">Начать играть</h1>
        <p className="text-ink-muted mb-6">
          Вход через Telegram, правила, ник и допуск по приглашению или заявке.
        </p>
        <ButtonLink
          href="/api/auth/telegram/start?return_to=/onboarding/minecraft"
          prefetch={false}
        >
          Войти через Telegram
        </ButtonLink>
      </div>
    );
  }

  const [o, wl] = await Promise.all([
    getAccessOverview(user.userId),
    getWhitelistState(user.userId),
  ]);
  const approved = o.membership?.status === "approved";
  const pending = o.application?.status === "pending";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Начать играть</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{
          rules: "Правила приняты.",
          nick: "Ник сохранён.",
          invite: "Приглашение принято. Допуск получен.",
          applied: "Заявка отправлена.",
          withdrawn: "Заявка отозвана.",
        }}
      />

      <Step n={1} title="Вход через Telegram" done />

      <Step n={2} title="Правила сервера" done={o.rulesAccepted}>
        {o.rulesAccepted ? (
          <Link href="/rules" className="text-brand-700 underline">
            Читать правила
          </Link>
        ) : o.rules ? (
          <ButtonLink href="/rules?return_to=/onboarding/minecraft">
            Прочитать и принять
          </ButtonLink>
        ) : (
          <p className="text-ink-muted">Правила ещё не опубликованы.</p>
        )}
      </Step>

      <Step n={3} title="Ник в Minecraft" done={!!o.identity}>
        {o.identity && (
          <p className="mb-3">
            Ваш ник: <strong>{o.identity.nickname}</strong>
          </p>
        )}
        {o.identity?.binding_status === "confirmed" ||
        approved ? null : !o.rulesAccepted ? (
          <p className="text-ink-muted">
            Сначала примите правила сервера (шаг 2).
          </p>
        ) : (
          <form action={reserveNickAction} className="flex flex-col gap-3">
            <input
              type="hidden"
              name="return_to"
              value="/onboarding/minecraft"
            />
            <Field
              name="nick"
              label={o.identity ? "Изменить ник" : "Ник"}
              hint="3–16 символов: латиница, цифры, «_». Если у вас лицензионный аккаунт Minecraft, укажите его ник."
              autoComplete="off"
              required
            />
            <Button type="submit" variant="secondary" className="self-start">
              Сохранить ник
            </Button>
          </form>
        )}
      </Step>

      <Step n={4} title="Допуск на сервер" done={approved}>
        {approved ? (
          <div className="flex flex-col gap-3">
            <p>
              {wl?.applied_state === "applied"
                ? "Доступ готов: можно подключаться к серверу."
                : "Допуск получен. Он применяется на сервере: статус «Доступ готов» появится, когда сервер подтвердит."}
            </p>
            <ButtonLink href="/start" className="self-start">
              Перейти к установке и подключению
            </ButtonLink>
          </div>
        ) : pending ? (
          <form
            action={withdrawApplicationAction}
            className="flex flex-col gap-3"
          >
            <input
              type="hidden"
              name="return_to"
              value="/onboarding/minecraft"
            />
            <StatusBadge tone="warn">Заявка на рассмотрении</StatusBadge>
            <Button type="submit" variant="secondary" className="self-start">
              Отозвать заявку
            </Button>
          </form>
        ) : !o.rulesAccepted || !o.identity ? (
          <p className="text-ink-muted">
            Этот шаг откроется, когда вы примете правила и укажете ник.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {o.application?.status === "rejected" && (
              <p>
                <StatusBadge tone="danger">Заявка отклонена</StatusBadge>
                {o.application.decision_reason && (
                  <span className="ml-2">
                    Причина: {o.application.decision_reason}
                  </span>
                )}
              </p>
            )}
            <form
              action={redeemInvitationAction}
              className="flex flex-col gap-3"
            >
              <input
                type="hidden"
                name="return_to"
                value="/onboarding/minecraft"
              />
              <Field
                name="token"
                label="У меня есть приглашение"
                hint="Вставьте код приглашения"
                autoComplete="off"
                required
              />
              <Button type="submit" className="self-start">
                Использовать приглашение
              </Button>
            </form>
            <form
              action={submitApplicationAction}
              className="flex flex-col gap-3"
            >
              <input
                type="hidden"
                name="return_to"
                value="/onboarding/minecraft"
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="app-text" className="font-medium">
                  Или подайте заявку
                </label>
                <textarea
                  id="app-text"
                  name="text"
                  rows={4}
                  maxLength={1000}
                  className="border-line bg-paper text-ink rounded-lg border px-3 py-2"
                  placeholder="Расскажите о себе (необязательно)"
                />
              </div>
              <Button type="submit" variant="secondary" className="self-start">
                Подать заявку
              </Button>
            </form>
          </div>
        )}
      </Step>
    </div>
  );
}
