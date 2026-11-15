import type { Metadata } from "next";
import Link from "next/link";
import {
  addToGalleryAction,
  deleteGalleryItemAction,
  updateGalleryItemAction,
} from "@/app/actions/social";
import { GalleryCard } from "@/components/social/gallery-card";
import { ImagePicker } from "@/components/social/image-picker";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import {
  CATEGORIES,
  isCategory,
  listMyGallery,
  listPublicGallery,
} from "@/lib/social/gallery";
import { storageUsage } from "@/lib/social/media";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Галерея" };

const OK_TEXTS = {
  added: "Скриншоты добавлены.",
  saved: "Изменения сохранены.",
  visibility: "Видимость изменена.",
  removed: "Изображение удалено.",
  reported: "Жалоба отправлена. Модерация рассмотрит её в течение суток.",
  moderated: "Решение модератора сохранено.",
};

const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4";
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

export default async function GalleryPage({
  searchParams,
}: PageProps<"/social/gallery">) {
  await requireFlag("ff_p1a");
  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(String(sp.p ?? "0"), 10) || 0);
  const viewer = await getViewer();
  const mine = viewer.canPublish && sp.mine === "1";
  const str = (v: unknown, max = 40) =>
    typeof v === "string" ? v.slice(0, max) : "";
  const filter = {
    author: str(sp.author, 16),
    category: isCategory(str(sp.category)) ? str(sp.category) : "",
    since: str(sp.since, 5),
    sort: str(sp.sort, 3),
    page,
  };

  const pub = mine
    ? null
    : await safely("public gallery", () => listPublicGallery(filter), null);
  const own = mine
    ? await safely("my gallery", () => listMyGallery(viewer.userId!), null)
    : [];
  const usage = mine
    ? await safely("storage usage", () => storageUsage(viewer.userId!), null)
    : null;

  const href = (over: Record<string, string | number>) => {
    const q = new URLSearchParams();
    const all: Record<string, string | number> = { ...filter, ...over };
    for (const [k, v] of Object.entries(all))
      if (v !== "" && v !== 0 && v !== undefined) q.set(k, String(v));
    const s = q.toString();
    return `/social/gallery${s ? `?${s}` : ""}`;
  };
  const tab = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      on ? "bg-brand-600 text-on-brand" : "border-line hover:bg-brand-50 border"
    }`;
  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
      on ? "bg-brand-600 text-on-brand" : "border-line hover:bg-brand-50 border"
    }`;
  const field =
    "bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Галерея
      </h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        Скриншоты игроков: постройки, пейзажи и забавные моменты. Свои
        изображения можно подписать, скрыть или удалить в любой момент.
      </p>

      <nav
        aria-label="Раздел галереи"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <Link
          href="/social/gallery"
          aria-current={!mine ? "page" : undefined}
          className={tab(!mine)}
        >
          Все скриншоты
        </Link>
        {viewer.canPublish && (
          <Link
            href="/social/gallery?mine=1"
            aria-current={mine ? "page" : undefined}
            className={tab(mine)}
          >
            Мои
          </Link>
        )}
        <Link
          href="/social"
          className="text-brand-700 ml-auto text-sm font-semibold underline underline-offset-4"
        >
          ← К ленте
        </Link>
      </nav>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />
      </div>

      {mine ? (
        <section aria-labelledby="mine" className="mt-4 flex flex-col gap-5">
          <h2 id="mine" className="sr-only">
            Мои изображения
          </h2>
          <Card>
            <form action={addToGalleryAction} className="flex flex-col gap-4">
              <h3 className="font-pixel text-xl">Добавить скриншоты</h3>
              <ImagePicker max={10} withCaptions />
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="up-cat" className="text-sm font-medium">
                    Категория
                  </label>
                  <select
                    id="up-cat"
                    name="category"
                    defaultValue="build"
                    className={field}
                  >
                    {Object.entries(CATEGORIES).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="flex items-center gap-4">
                  <legend className="sr-only">Кто видит</legend>
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
                </fieldset>
                <PendingButton className="ml-auto" pendingText="Добавляем…">
                  Добавить в галерею
                </PendingButton>
              </div>
              {usage && (
                <div>
                  <div
                    className="bg-line h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-label="Занято места"
                    aria-valuenow={Math.round(
                      (usage.total / usage.totalLimit) * 100,
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="bg-brand-500 h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (usage.total / usage.totalLimit) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-ink-muted mt-1 text-xs">
                    Занято {mb(usage.total)} из {mb(usage.totalLimit)} · за
                    сутки загружено {mb(usage.day)} из {mb(usage.dayLimit)}
                  </p>
                </div>
              )}
            </form>
          </Card>

          {own === null ? (
            <ErrorState
              title="Не удалось загрузить ваши изображения"
              description="Обновите страницу через минуту."
            />
          ) : own.length === 0 ? (
            <EmptyState
              title="В галерее пока нет изображений"
              description="Загрузите первый скриншот: он появится здесь и в общей галерее."
            />
          ) : (
            <ul className={gridClass}>
              {own.map((g) => (
                <li
                  key={g.id}
                  className="border-line bg-surface flex flex-col overflow-hidden rounded-2xl border"
                >
                  <Link href={`/social/gallery/${g.id}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/media/${g.id}`}
                      alt={g.caption || "Моё изображение"}
                      width={g.width}
                      height={g.height}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge
                        tone={g.visibility === "public" ? "ok" : "neutral"}
                      >
                        {g.visibility === "public" ? "Видно всем" : "Скрыто"}
                      </StatusBadge>
                      {g.hidden && (
                        <StatusBadge tone="danger">
                          Скрыто модерацией
                        </StatusBadge>
                      )}
                    </div>
                    {g.hidden && g.hiddenReason && (
                      <p className="text-danger text-xs">
                        Причина: {g.hiddenReason}
                      </p>
                    )}
                    {g.caption && (
                      <p className="text-sm break-words">{g.caption}</p>
                    )}
                    <p className="text-ink-muted text-xs">
                      {CATEGORIES[g.category]}
                      {g.usedIn > 0 && ` · в публикациях: ${g.usedIn}`}
                    </p>
                    <details className="mt-auto">
                      <summary className="text-brand-700 min-h-11 cursor-pointer py-2 text-sm font-semibold">
                        Изменить
                      </summary>
                      <form
                        action={updateGalleryItemAction}
                        className="mt-1 flex flex-col gap-2"
                      >
                        <input type="hidden" name="media_id" value={g.id} />
                        <label
                          className="text-xs font-medium"
                          htmlFor={`c-${g.id}`}
                        >
                          Подпись
                        </label>
                        <input
                          id={`c-${g.id}`}
                          name="caption"
                          maxLength={200}
                          defaultValue={g.caption}
                          className={field}
                        />
                        <label
                          className="text-xs font-medium"
                          htmlFor={`k-${g.id}`}
                        >
                          Категория
                        </label>
                        <select
                          id={`k-${g.id}`}
                          name="category"
                          defaultValue={g.category}
                          className={field}
                        >
                          {Object.entries(CATEGORIES).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <label
                          className="text-xs font-medium"
                          htmlFor={`v-${g.id}`}
                        >
                          Видимость
                        </label>
                        <select
                          id={`v-${g.id}`}
                          name="visibility"
                          defaultValue={g.visibility}
                          className={field}
                        >
                          <option value="public">Видно всем</option>
                          <option value="private">Только мне</option>
                        </select>
                        <PendingButton
                          className="min-h-11 px-4 text-sm"
                          pendingText="Сохраняем…"
                        >
                          Сохранить
                        </PendingButton>
                      </form>
                    </details>
                    <details>
                      <summary className="text-danger min-h-11 cursor-pointer py-2 text-sm font-semibold">
                        Удалить
                      </summary>
                      <form
                        action={deleteGalleryItemAction}
                        className="mt-1 flex flex-col gap-2"
                      >
                        <input type="hidden" name="media_id" value={g.id} />
                        <p className="text-xs">
                          {g.usedIn > 0
                            ? `Изображение используется в публикациях: ${g.usedIn}. Оно исчезнет и оттуда, а тексты публикаций останутся.`
                            : "Изображение исчезнет сразу, файл будет удалён через 30 дней."}
                        </p>
                        <PendingButton
                          variant="danger"
                          className="min-h-11 px-4 text-sm"
                          pendingText="Удаляем…"
                        >
                          Удалить изображение
                        </PendingButton>
                      </form>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-labelledby="all" className="mt-4 flex flex-col gap-4">
          <h2 id="all" className="sr-only">
            Галерея сообщества
          </h2>
          <form
            role="search"
            action="/social/gallery"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex min-w-40 flex-1 flex-col gap-1.5">
              <label htmlFor="f-author" className="text-sm font-medium">
                Автор (ник)
              </label>
              <input
                id="f-author"
                name="author"
                defaultValue={filter.author}
                maxLength={16}
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-since" className="text-sm font-medium">
                За период
              </label>
              <select
                id="f-since"
                name="since"
                defaultValue={filter.since}
                className={field}
              >
                <option value="">Всё время</option>
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-sort" className="text-sm font-medium">
                Порядок
              </label>
              <select
                id="f-sort"
                name="sort"
                defaultValue={filter.sort}
                className={field}
              >
                <option value="">Сначала новые</option>
                <option value="old">Сначала старые</option>
              </select>
            </div>
            {filter.category && (
              <input type="hidden" name="category" value={filter.category} />
            )}
            <button
              type="submit"
              className="bg-brand-600 text-on-brand min-h-11 rounded-full px-6 font-semibold"
            >
              Показать
            </button>
          </form>
          <nav aria-label="Категория" className="flex flex-wrap gap-2">
            <Link
              href={href({ category: "", p: 0 })}
              aria-current={!filter.category ? "page" : undefined}
              className={chip(!filter.category)}
            >
              Все
            </Link>
            {Object.entries(CATEGORIES).map(([id, label]) => (
              <Link
                key={id}
                href={href({ category: id, p: 0 })}
                aria-current={filter.category === id ? "page" : undefined}
                className={chip(filter.category === id)}
              >
                {label}
              </Link>
            ))}
          </nav>

          {pub === null ? (
            <ErrorState
              title="Не удалось загрузить галерею"
              description="Обновите страницу через минуту."
            />
          ) : pub.items.length === 0 ? (
            <EmptyState
              title={
                filter.author || filter.category || filter.since
                  ? "По выбранным условиям ничего не найдено"
                  : "В галерее пока пусто"
              }
              description={
                viewer.canPublish
                  ? "Загрузите первый скриншот во вкладке «Мои»."
                  : "Первые скриншоты появятся здесь."
              }
            />
          ) : (
            <ul className={gridClass}>
              {pub.items.map((g) => (
                <li key={g.id}>
                  <GalleryCard item={g} />
                </li>
              ))}
            </ul>
          )}
          {pub && (page > 0 || pub.hasMore) && (
            <div className="flex items-center justify-between">
              {page > 0 ? (
                <Link
                  href={href({ p: page - 1 })}
                  className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
                >
                  ← Новее
                </Link>
              ) : (
                <span />
              )}
              {pub.hasMore && (
                <Link
                  href={href({ p: page + 1 })}
                  className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
                >
                  Дальше →
                </Link>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
