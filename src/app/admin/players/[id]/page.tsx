import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminDeleteAction, setStatusAction } from "@/app/actions/staff";
import { getPlayer } from "@/lib/admin/players";
import { isStepUpFresh } from "@/lib/admin/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATUS_LABEL } from "@/lib/admin/labels";

export const metadata: Metadata = { title: "Игрок" };

export default async function PlayerPage({
  params,
  searchParams,
}: PageProps<"/admin/players/[id]">) {
  const admin = await requireStaff(["admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await getPlayer(id);
  if (!p) notFound();
  const s = STATUS_LABEL[p.user.account_status] ?? STATUS_LABEL.active;
  const fresh = isStepUpFresh(admin.stepUpUntil);
  const self = p.user.id === admin.userId;
  const deleted = p.user.account_status === "deleted";

  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">
        {p.identities[0]?.nickname ?? p.user.display_name ?? "Игрок"}
      </h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{
          suspend: "Аккаунт приостановлен.",
          ban: "Аккаунт забанен.",
          unban: "Ограничение снято.",
          deleted: "Аккаунт удалён.",
        }}
      />
      <Card className="mb-6 flex flex-col gap-2">
        <p>
          <StatusBadge tone={s.tone}>{s.text}</StatusBadge>
        </p>
        <p>Роль: {p.user.site_role}</p>
        <p>
          Telegram:{" "}
          {p.telegram
            ? `@${p.telegram.username ?? "без имени"}`
            : "не привязан"}
        </p>
        <p>Допуск: {p.membership?.status ?? "нет"}</p>
        <p>
          Whitelist:{" "}
          {p.whitelist
            ? `${p.whitelist.desired}, ${p.whitelist.applied_state}`
            : "нет записи"}
        </p>
        {p.user.restriction_reason && (
          <p>Причина ограничения: {p.user.restriction_reason}</p>
        )}
        {p.user.banned_until && (
          <p>Бан до: {new Date(p.user.banned_until).toLocaleString("ru-RU")}</p>
        )}
        {p.identities.map((i, n) => (
          <p key={n} className="text-ink-muted text-sm">
            Ник {i.nickname}: {i.binding_status}
            {i.quarantine_until
              ? `, карантин до ${new Date(i.quarantine_until).toLocaleDateString("ru-RU")}`
              : ""}
          </p>
        ))}
      </Card>

      {!deleted && !self && (
        <Card className="flex flex-col gap-4" aria-label="Действия">
          <h2 className="text-lg font-semibold">Действия</h2>
          {!fresh && (
            <p role="status">
              <StatusBadge tone="info">
                Для этих действий нужен код подтверждения
              </StatusBadge>{" "}
              <ButtonLink
                href={`/admin/step-up?return_to=/admin/players/${id}`}
                variant="secondary"
              >
                Ввести код
              </ButtonLink>
            </p>
          )}
          {p.user.account_status === "active" && (
            <>
              <form action={setStatusAction} className="flex flex-col gap-3">
                <input type="hidden" name="user_id" value={id} />
                <input type="hidden" name="action" value="suspend" />
                <Field name="reason" label="Причина приостановки" required />
                <Button
                  type="submit"
                  variant="secondary"
                  className="self-start"
                >
                  Приостановить
                </Button>
              </form>
              <form action={setStatusAction} className="flex flex-col gap-3">
                <input type="hidden" name="user_id" value={id} />
                <input type="hidden" name="action" value="ban" />
                <Field name="reason" label="Причина бана" required />
                <Field
                  name="days"
                  label="Срок бана в днях (пусто = бессрочно)"
                  type="number"
                  min={1}
                />
                <Button type="submit" variant="danger" className="self-start">
                  Забанить
                </Button>
              </form>
            </>
          )}
          {p.user.account_status === "suspended" && (
            <form action={setStatusAction} className="flex flex-col gap-3">
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="action" value="ban" />
              <Field name="reason" label="Причина бана" required />
              <Button type="submit" variant="danger" className="self-start">
                Забанить
              </Button>
            </form>
          )}
          {(p.user.account_status === "banned" ||
            p.user.account_status === "suspended") && (
            <form action={setStatusAction} className="flex flex-col gap-3">
              <input type="hidden" name="user_id" value={id} />
              <input type="hidden" name="action" value="unban" />
              <Button type="submit" className="self-start">
                Снять ограничение
              </Button>
            </form>
          )}
          <form
            action={adminDeleteAction}
            className="border-line border-t pt-4"
          >
            <input type="hidden" name="user_id" value={id} />
            <Button type="submit" variant="danger">
              Удалить аккаунт
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
