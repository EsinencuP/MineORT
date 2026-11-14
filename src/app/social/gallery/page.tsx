import type { Metadata } from "next";
import Link from "next/link";
import {
  addToGalleryAction,
  galleryRemoveAction,
  galleryVisibilityAction,
} from "@/app/actions/social";
import { ImagePicker } from "@/components/social/image-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import { listMyGallery, listPublicGallery } from "@/lib/social/gallery";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Галерея" };

const OK_TEXTS = {
  added: "Изображения добавлены.",
  visibility: "Видимость изменена.",
  removed: "Изображение удалено из галереи.",
};

const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3";

export default async function GalleryPage({
  searchParams,
}: PageProps<"/social/gallery">) {
  await requireFlag("ff_p1a");
  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(String(sp.p ?? "0"), 10) || 0);
  const viewer = await getViewer();
  const pub = await safely(
    "public gallery",
    () => listPublicGallery(page),
    null,
  );
  const mine = viewer.canPublish
    ? await safely("my gallery", () => listMyGallery(viewer.userId!), [])
    : [];
  const pager = (p: number) => `/social/gallery${p > 0 ? `?p=${p}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Галерея
      </h1>
      <p className="text-ink-muted mt-2">
        Скриншоты игроков. Свои изображения можно скрыть или удалить в любой
        момент.
      </p>
      <p className="mt-3">
        <Link
          href="/social"
          className="text-brand-700 text-sm font-semibold underline underline-offset-4"
        >
          ← К ленте
        </Link>
      </p>

      <div className="mt-5">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />
      </div>

      {viewer.canPublish && (
        <section aria-labelledby="mine" className="mt-4 flex flex-col gap-4">
          <h2 id="mine" className="text-2xl">
            Мои изображения
          </h2>
          <Card>
            <form action={addToGalleryAction} className="flex flex-col gap-4">
              <ImagePicker max={10} />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="public"
                    defaultChecked
                    className="size-4 accent-[color:var(--brand-600)]"
                  />
                  Показывать всем
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="visibility"
                    value="private"
                    className="size-4 accent-[color:var(--brand-600)]"
                  />
                  Только мне
                </label>
                <Button type="submit" className="ml-auto">
                  Добавить в галерею
                </Button>
              </div>
            </form>
          </Card>
          {mine.length === 0 ? (
            <EmptyState
              title="Своих изображений пока нет"
              description="Добавь скриншот, и он появится здесь и в галерее сообщества."
            />
          ) : (
            <ul className={gridClass}>
              {mine.map((g) => (
                <li
                  key={g.id}
                  className="border-line bg-surface overflow-hidden rounded-2xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${g.id}`}
                    alt="Моё изображение"
                    width={g.width}
                    height={g.height}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="flex flex-col gap-2 p-3">
                    <StatusBadge
                      tone={g.visibility === "public" ? "ok" : "neutral"}
                    >
                      {g.visibility === "public" ? "Видно всем" : "Скрыто"}
                    </StatusBadge>
                    <div className="flex flex-wrap gap-1">
                      <form action={galleryVisibilityAction}>
                        <input type="hidden" name="media_id" value={g.id} />
                        <input
                          type="hidden"
                          name="visibility"
                          value={
                            g.visibility === "public" ? "private" : "public"
                          }
                        />
                        <button
                          type="submit"
                          className="hover:bg-brand-50 min-h-11 rounded-full px-3 text-sm font-semibold"
                        >
                          {g.visibility === "public" ? "Скрыть" : "Показать"}
                        </button>
                      </form>
                      <form action={galleryRemoveAction}>
                        <input type="hidden" name="media_id" value={g.id} />
                        <button
                          type="submit"
                          className="text-danger hover:bg-danger-bg min-h-11 rounded-full px-3 text-sm font-semibold"
                        >
                          Удалить
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="all" className="mt-10 flex flex-col gap-4">
        <h2 id="all" className="text-2xl">
          Галерея сообщества
        </h2>
        {pub === null ? (
          <ErrorState
            title="Не удалось загрузить галерею"
            description="Обновите страницу через минуту."
          />
        ) : pub.items.length === 0 ? (
          <EmptyState
            title="В галерее пока пусто"
            description="Первые скриншоты появятся здесь."
          />
        ) : (
          <ul className={gridClass}>
            {pub.items.map((g) => (
              <li
                key={g.id}
                className="border-line bg-surface overflow-hidden rounded-2xl border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/media/${g.id}`}
                  alt={`Скриншот игрока ${g.owner ?? ""}`.trim()}
                  width={g.width}
                  height={g.height}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <p className="text-ink-muted truncate px-3 py-2 text-xs">
                  {g.owner}
                </p>
              </li>
            ))}
          </ul>
        )}
        {pub && (page > 0 || pub.hasMore) && (
          <div className="flex items-center justify-between">
            {page > 0 ? (
              <Link
                href={pager(page - 1)}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                ← Новее
              </Link>
            ) : (
              <span />
            )}
            {pub.hasMore && (
              <Link
                href={pager(page + 1)}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                Старше →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
