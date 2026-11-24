import { notFound, redirect } from "next/navigation";
import { updateCalendarSubscriptionAction } from "@/app/actions/notifications";
import { CopyButton } from "@/components/portal/copy-button";
import { PendingButton } from "@/components/social/pending-button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  calendarSubscriptionConfigured,
  calendarSubscriptionPath,
} from "@/lib/social/calendar-token";
import { calendarEnabled } from "@/lib/social/events";
import { getViewer } from "@/lib/social/viewer";

export const metadata = { title: "Мои события MineOrt" };

export default async function CalendarSubscriptionPage() {
  if (!calendarEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login?return_to=%2Fdashboard%2Fcalendar");
  const path = await calendarSubscriptionPath(viewer.userId);
  const url = path
    ? new URL(path, process.env.APP_URL || "http://localhost:3000").href
    : null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <ButtonLink href="/social/calendar" variant="ghost">
          ← События
        </ButtonLink>
      </div>
      <h1 className="text-3xl">Мои события MineOrt</h1>
      <Card className="flex flex-col items-start gap-4">
        <p className="text-ink-muted">
          Добавьте личную ссылку в приложение календаря. Переносы и отмены
          появятся при его следующем обновлении.
        </p>
        {url && (
          <>
            <p className="text-ink-muted text-sm">
              Храните ссылку как пароль. После отзыва она перестанет работать.
            </p>
            <div className="flex w-full flex-wrap gap-2">
              <input
                aria-label="Личная ссылка календаря"
                value={url}
                readOnly
                className="border-line bg-paper min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
              />
              <CopyButton text={url} label="Скопировать ссылку" />
            </div>
          </>
        )}
        {calendarSubscriptionConfigured() ? (
          <form
            action={updateCalendarSubscriptionAction}
            className="flex flex-wrap gap-2"
          >
            <PendingButton name="operation" value="issue">
              {url ? "Выпустить новую ссылку" : "Выпустить ссылку"}
            </PendingButton>
            {url && (
              <PendingButton variant="ghost" name="operation" value="revoke">
                Отозвать ссылку
              </PendingButton>
            )}
          </form>
        ) : (
          <p>Подписка пока недоступна.</p>
        )}
      </Card>
    </div>
  );
}
