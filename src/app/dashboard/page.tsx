import type { Metadata } from "next";
import Link from "next/link";
import { getAccessOverview, getTelegramBinding } from "@/lib/access/store";
import { requireUser } from "@/lib/auth/guards";
import { getWhitelistState } from "@/lib/bridge/whitelist";
import { getSettings } from "@/lib/guides/store";
import { CAN_CONNECT } from "@/lib/onboarding/stage";
import { getStageForUser } from "@/lib/onboarding/server";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Личный кабинет" };
export const dynamic = "force-dynamic";

type Line = { tone: BadgeTone; text: string };

function applicationLine(status: string | undefined): Line {
  switch (status) {
    case "pending":
      return { tone: "warn", text: "Заявка на рассмотрении" };
    case "approved":
      return { tone: "ok", text: "Заявка одобрена" };
    case "rejected":
      return { tone: "danger", text: "Заявка отклонена" };
    case "withdrawn":
      return { tone: "neutral", text: "Заявка отозвана" };
    default:
      return { tone: "neutral", text: "Заявки нет" };
  }
}

function membershipLine(status: string | undefined): Line {
  switch (status) {
    case "approved":
      return { tone: "ok", text: "Допуск получен" };
    case "pending":
      return { tone: "warn", text: "Допуск ожидает решения" };
    case "suspended":
      return { tone: "danger", text: "Допуск приостановлен" };
    default:
      return { tone: "neutral", text: "Допуска пока нет" };
  }
}

/** Honest text: "applied" is the only state that means the game server really has the entry. */
function whitelistLine(
  wl: { desired: string; applied_state: string } | null,
): Line {
  if (!wl || wl.desired === "off")
    return { tone: "neutral", text: "Доступ на сервере не оформлен" };
  switch (wl.applied_state) {
    case "applied":
      return { tone: "ok", text: "Доступ готов: сервер подтвердил" };
    case "failed":
      return {
        tone: "danger",
        text: "Не удалось применить на сервере: задержка, администратор уведомлён",
      };
    case "drift":
      return { tone: "warn", text: "Задержка: сервер сверяет доступ" };
    default:
      return { tone: "warn", text: "Применяется на сервере" };
  }
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const [o, wl, tg, settings, st] = await Promise.all([
    getAccessOverview(user.userId),
    getWhitelistState(user.userId),
    getTelegramBinding(user.userId),
    getSettings(),
    getStageForUser(user.userId),
  ]);

  const rows: { title: string; line: Line }[] = [
    { title: "Заявка", line: applicationLine(o.application?.status) },
    { title: "Допуск", line: membershipLine(o.membership?.status) },
    { title: "Доступ на сервере", line: whitelistLine(wl) },
    {
      title: "Личность в игре",
      line:
        o.identity?.binding_status === "confirmed"
          ? { tone: "ok", text: "Подтверждена" }
          : {
              tone: "neutral",
              text: "Не подтверждена: подтвердите при первом входе в игру",
            },
    },
  ];
  const restricted = st.stage === "restricted";
  const canConnect = CAN_CONNECT.has(st.stage);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Личный кабинет</h1>
      <Notice error={sp.error} ok={sp.ok} />

      {restricted && (
        <Card className="mb-6" role="alert">
          <StatusBadge tone="danger">Доступ ограничен</StatusBadge>
          <p className="mt-2">
            Игровые шаги недоступны.{" "}
            {settings.support_contact
              ? `Свяжитесь с администрацией: ${settings.support_contact}.`
              : "Свяжитесь с администрацией."}
          </p>
        </Card>
      )}

      <Card className="mb-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Статусы</h2>
        <dl className="flex flex-col gap-3">
          {rows.map((r) => (
            <div
              key={r.title}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <dt className="min-w-44 font-medium">{r.title}</dt>
              <dd>
                <StatusBadge tone={r.line.tone}>{r.line.text}</StatusBadge>
              </dd>
            </div>
          ))}
        </dl>
        {o.application?.status === "rejected" &&
          o.application.decision_reason && (
            <p>Причина отклонения: {o.application.decision_reason}</p>
          )}
        {!restricted && o.membership?.status !== "approved" && (
          <div>
            <ButtonLink href="/onboarding/minecraft">
              Продолжить регистрацию
            </ButtonLink>
          </div>
        )}
      </Card>

      {canConnect && (
        <Card className="mb-6 flex flex-col gap-2" aria-label="Подключение">
          <h2 className="text-lg font-semibold">Подключение к серверу</h2>
          {settings.server_address ? (
            <p>
              Адрес сервера:{" "}
              <code className="bg-paper rounded px-2 py-1 font-mono">
                {settings.server_address}
              </code>
            </p>
          ) : (
            <p className="text-ink-muted">Адрес сервера скоро появится.</p>
          )}
          <p>
            <Link href="/start" className="text-brand-700 underline">
              Инструкция по установке и подключению
            </Link>
          </p>
        </Card>
      )}

      <Card className="mb-6 flex flex-col gap-2" aria-label="Привязки">
        <h2 className="text-lg font-semibold">Настройки и привязки</h2>
        <p>
          Telegram:{" "}
          <strong>
            {tg
              ? tg.username
                ? `@${tg.username}`
                : "привязан"
              : "не привязан"}
          </strong>
        </p>
        <p>
          Ник в Minecraft:{" "}
          <strong>{o.identity?.nickname ?? "не указан"}</strong>
        </p>
        <p>Правила: {o.rulesAccepted ? "приняты" : "не приняты"}</p>
      </Card>

      <div className="flex flex-wrap items-center gap-6">
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="text-brand-700 min-h-11 underline">
            Выйти
          </button>
        </form>
        <Link
          href="/dashboard/delete"
          className="text-danger min-h-11 py-2 underline"
        >
          Удалить аккаунт
        </Link>
      </div>
    </div>
  );
}
