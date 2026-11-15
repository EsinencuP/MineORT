import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { moderateMediaAction, reportMediaAction } from "@/app/actions/social";
import { GalleryKeyNav } from "@/components/social/gallery-key-nav";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireFlag } from "@/lib/flags";
import { CATEGORIES, getGalleryItem } from "@/lib/social/gallery";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OK_TEXTS = {
  reported: "Жалоба отправлена. Модерация рассмотрит её в течение суток.",
  moderated: "Решение модератора сохранено.",
  saved: "Изменения сохранены.",
};

export async function generateMetadata({
  params,
}: PageProps<"/social/gallery/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Галерея" };
  const found = await getGalleryItem(await getViewer(), id).catch(() => null);
  return { title: found?.item.caption || "Скриншот" };
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Chisinau",
  }).format(new Date(iso));

export default async function GalleryItemPage({
  params,
  searchParams,
}: PageProps<"/social/gallery/[id]">) {
  await requireFlag("ff_p1a");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  const found = await getGalleryItem(viewer, id);
  if (!found) notFound(); // hidden, private, deleted and unknown look the same
  const { item, prev, next, usedIn, isOwner } = found;
  const back = isOwner ? "/social/gallery?mine=1" : "/social/gallery";
  const here = `/social/gallery/${id}`;
  const field =
    "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <GalleryKeyNav
        prev={prev ? `/social/gallery/${prev}` : null}
        next={next ? `/social/gallery/${next}` : null}
        back={back}
      />
      <p>
        <Link
          href={back}
          className="text-brand-700 text-sm font-semibold underline underline-offset-4"
        >
          ← В галерею
        </Link>
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        <figure className="border-line bg-surface overflow-hidden rounded-2xl border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/media/${item.id}`}
            alt={item.caption || `Скриншот игрока ${item.owner}`}
            width={item.width}
            height={item.height}
            className="mx-auto max-h-[75vh] w-full object-contain"
          />
        </figure>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {prev ? (
            <Link
              href={`/social/gallery/${prev}`}
              rel="prev"
              className="border-line hover:bg-brand-50 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            >
              ← Новее
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted hidden text-xs sm:block">
            Стрелками ← → можно листать, Esc — вернуться
          </span>
          {next ? (
            <Link
              href={`/social/gallery/${next}`}
              rel="next"
              className="border-line hover:bg-brand-50 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold"
            >
              Старее →
            </Link>
          ) : (
            <span />
          )}
        </div>

        <Card className="flex flex-col gap-3">
          {item.caption && (
            <h1 className="font-pixel text-2xl leading-snug break-words">
              {item.caption}
            </h1>
          )}
          {!item.caption && <h1 className="sr-only">Скриншот</h1>}
          <p className="text-ink-muted text-sm">
            Автор:{" "}
            <Link
              href={`/social/gallery?author=${encodeURIComponent(item.owner)}`}
              className="text-ink font-semibold underline underline-offset-4"
            >
              {item.owner}
            </Link>{" "}
            · {fmt(item.createdAt)} · {CATEGORIES[item.category]}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.visibility === "private" && (
              <StatusBadge>Только автор</StatusBadge>
            )}
            {item.hidden && (
              <StatusBadge tone="danger">Скрыто модерацией</StatusBadge>
            )}
          </div>
          {item.hidden &&
            item.hiddenReason &&
            (isOwner || viewer.canModerate) && (
              <p className="text-danger text-sm">
                Причина: {item.hiddenReason}
              </p>
            )}
          {(isOwner || viewer.canModerate) && usedIn > 0 && (
            <p className="text-ink-muted text-sm">
              Используется в публикациях: {usedIn}
            </p>
          )}
          {isOwner && (
            <p>
              <Link
                href="/social/gallery?mine=1"
                className="text-brand-700 text-sm font-semibold underline underline-offset-4"
              >
                Изменить подпись, категорию или удалить
              </Link>
            </p>
          )}
        </Card>

        {!isOwner && viewer.cls !== "guest" && !item.hidden && (
          <details className="relative">
            <summary className="text-ink-muted hover:bg-brand-50 flex min-h-11 w-fit cursor-pointer list-none items-center rounded-full px-4 text-sm">
              Пожаловаться
            </summary>
            <form
              action={reportMediaAction}
              className="border-line bg-paper mt-2 flex max-w-md flex-col gap-2 rounded-2xl border p-3"
            >
              <input type="hidden" name="media_id" value={item.id} />
              <input type="hidden" name="return_to" value={here} />
              <label className="text-sm font-medium" htmlFor="rep">
                Что не так?
              </label>
              <textarea
                id="rep"
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                className="bg-paper text-ink border-line rounded-xl border px-3 py-2 text-sm"
              />
              <PendingButton
                className="min-h-11 px-4 text-sm"
                pendingText="Отправляем…"
              >
                Отправить жалобу
              </PendingButton>
            </form>
          </details>
        )}

        {viewer.canModerate && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl">Модерация</h2>
            <form
              action={moderateMediaAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="media_id" value={item.id} />
              <input type="hidden" name="return_to" value={here} />
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <label htmlFor="mod-reason" className="text-sm font-medium">
                  Причина (обязательна для «Скрыть» и «Удалить»)
                </label>
                <input id="mod-reason" name="reason" className={field} />
              </div>
              {item.hidden ? (
                <PendingButton
                  name="action"
                  value="unhide"
                  variant="secondary"
                  className="min-h-11 px-4 text-sm"
                  pendingText="…"
                >
                  Вернуть
                </PendingButton>
              ) : (
                <PendingButton
                  name="action"
                  value="hide"
                  variant="secondary"
                  className="min-h-11 px-4 text-sm"
                  pendingText="…"
                >
                  Скрыть
                </PendingButton>
              )}
              <PendingButton
                name="action"
                value="delete"
                variant="danger"
                className="min-h-11 px-4 text-sm"
                pendingText="…"
              >
                Удалить
              </PendingButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
