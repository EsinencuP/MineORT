import type { Metadata } from "next";
import { getAccessOverview } from "@/lib/access/store";
import { requireUser } from "@/lib/auth/guards";
import { getWhitelistState } from "@/lib/bridge/whitelist";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Личный кабинет" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const [o, wl] = await Promise.all([
    getAccessOverview(user.userId),
    getWhitelistState(user.userId),
  ]);

  let tone: BadgeTone = "neutral";
  let label = "Допуск не оформлен";
  if (o.membership?.status === "approved") {
    // "Ready" only when the game server confirmed the whitelist entry.
    if (wl?.applied_state === "applied") {
      tone = "ok";
      label = "Доступ готов: можно подключаться";
    } else if (wl?.applied_state === "failed") {
      tone = "danger";
      label =
        "Допуск получен, но не применён на сервере. Администратор уведомлён";
    } else {
      tone = "warn";
      label = "Допуск получен, применяется на сервере";
    }
  } else if (o.membership?.status === "suspended") {
    tone = "danger";
    label = "Допуск приостановлен";
  } else if (o.application?.status === "pending") {
    tone = "warn";
    label = "Заявка на рассмотрении";
  } else if (o.application?.status === "rejected") {
    tone = "danger";
    label = "Заявка отклонена";
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">Личный кабинет</h1>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Статус доступа</h2>
        <div>
          <StatusBadge tone={tone}>{label}</StatusBadge>
        </div>
        <p>
          Ник: <strong>{o.identity?.nickname ?? "не указан"}</strong>
        </p>
        <p>Правила: {o.rulesAccepted ? "приняты" : "не приняты"}</p>
        {o.application?.status === "rejected" &&
          o.application.decision_reason && (
            <p>Причина отклонения: {o.application.decision_reason}</p>
          )}
        {o.membership?.status !== "approved" && (
          <div>
            <ButtonLink href="/start">Продолжить регистрацию</ButtonLink>
          </div>
        )}
      </Card>
      <form action="/api/auth/logout" method="post" className="mt-6">
        <button type="submit" className="text-brand-700 min-h-11 underline">
          Выйти
        </button>
      </form>
    </div>
  );
}
