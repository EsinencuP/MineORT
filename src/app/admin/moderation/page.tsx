import type { Metadata } from "next";
import { decideReportAction } from "@/app/actions/social";
import { requireStaff } from "@/lib/auth/guards";
import { listOpenReports } from "@/lib/social/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Модерация" };
export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  hidden: "Уже скрыто",
  deleted: "Уже удалено",
  gone: "Не найдено",
};

export default async function ModerationPage({
  searchParams,
}: PageProps<"/admin/moderation">) {
  await requireStaff();
  const sp = await searchParams;
  const reports = await listOpenReports();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Жалобы на публикации</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ decided: "Решение сохранено." }}
      />
      {reports.length === 0 ? (
        <EmptyState
          title="Открытых жалоб нет"
          description="Новые появятся здесь."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge tone="warn">Жалоба</StatusBadge>
                  <span className="text-ink-muted">
                    {new Date(r.createdAt).toLocaleString("ru-RU")} · автор
                    поста: {r.author}
                  </span>
                  {STATE_LABEL[r.postState] && (
                    <StatusBadge>{STATE_LABEL[r.postState]}</StatusBadge>
                  )}
                </div>
                <p className="border-line rounded-xl border p-3 break-words whitespace-pre-line">
                  {r.postBody || "—"}
                </p>
                <p className="text-sm">
                  <strong>Причина жалобы:</strong> {r.reason}
                </p>
                <form
                  action={decideReportAction}
                  className="flex flex-col gap-3"
                >
                  <input type="hidden" name="report_id" value={r.id} />
                  <label className="text-sm font-medium" htmlFor={`n-${r.id}`}>
                    Комментарий (обязателен для «Скрыть» и «Удалить»)
                  </label>
                  <input
                    id={`n-${r.id}`}
                    name="note"
                    className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      name="decision"
                      value="hide"
                      variant="secondary"
                    >
                      Скрыть
                    </Button>
                    <Button
                      type="submit"
                      name="decision"
                      value="delete"
                      variant="danger"
                    >
                      Удалить
                    </Button>
                    <Button
                      type="submit"
                      name="decision"
                      value="dismiss"
                      variant="ghost"
                    >
                      Оставить
                    </Button>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
