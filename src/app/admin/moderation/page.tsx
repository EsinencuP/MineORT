import type { Metadata } from "next";
import { decideMarkerAction } from "@/app/actions/map";
import { decideReportAction } from "@/app/actions/social";
import { isEnabled } from "@/lib/flags";
import { listPendingMarkers } from "@/lib/map/markers";
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
  const pending = isEnabled("ff_p1c_atlas") ? await listPendingMarkers() : [];
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Жалобы</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{
          decided: "Решение сохранено.",
          marker_decided: "Решение по метке сохранено.",
        }}
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
                  <StatusBadge tone="warn">
                    {r.kind === "media"
                      ? "Жалоба на изображение"
                      : r.kind === "marker"
                        ? "Жалоба на метку карты"
                        : "Жалоба на публикацию"}
                  </StatusBadge>
                  <span className="text-ink-muted">
                    {new Date(r.createdAt).toLocaleString("ru-RU")} · автор:{" "}
                    {r.author}
                  </span>
                  {STATE_LABEL[r.postState] && (
                    <StatusBadge>{STATE_LABEL[r.postState]}</StatusBadge>
                  )}
                </div>
                {r.mediaId && (
                  <a
                    href={`/social/gallery/${r.mediaId}`}
                    className="block w-fit"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${r.mediaId}`}
                      alt="Изображение, на которое пожаловались"
                      className="border-line max-h-60 rounded-xl border object-contain"
                    />
                  </a>
                )}
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
      {pending.length > 0 && (
        <section className="mt-8" aria-labelledby="pending-markers">
          <h2 id="pending-markers" className="mb-3 text-xl font-bold">
            Публичные метки на проверке
          </h2>
          <ul className="flex flex-col gap-3">
            {pending.map((m) => (
              <li key={m.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/map/ui/markers/${m.icon}.png`}
                      alt=""
                      className="size-8 [image-rendering:pixelated]"
                    />
                    <strong>{m.name}</strong>
                    <span className="text-ink-muted">
                      {m.dim === "nether" ? "Незер" : "Верхний мир"} ·{" "}
                      {new Date(m.createdAt).toLocaleString("ru-RU")} · автор:{" "}
                      {m.author}
                    </span>
                  </div>
                  {m.description && (
                    <p className="border-line rounded-xl border p-3 break-words whitespace-pre-line">
                      {m.description}
                    </p>
                  )}
                  <a
                    href={`/map?m=${m.id}`}
                    className="text-accent w-fit text-sm underline"
                  >
                    Открыть на карте
                  </a>
                  <form
                    action={decideMarkerAction}
                    className="flex flex-col gap-3"
                  >
                    <input type="hidden" name="marker_id" value={m.id} />
                    <label
                      className="text-sm font-medium"
                      htmlFor={`m-${m.id}`}
                    >
                      Комментарий (обязателен для «Скрыть»)
                    </label>
                    <input
                      id={`m-${m.id}`}
                      name="note"
                      className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" name="decision" value="approve">
                        Одобрить
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="hide"
                        variant="secondary"
                      >
                        Скрыть
                      </Button>
                    </div>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
