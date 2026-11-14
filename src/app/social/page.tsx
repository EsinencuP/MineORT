import type { Metadata } from "next";
import Link from "next/link";
import { Composer } from "@/components/social/composer";
import { PostCard } from "@/components/social/post-card";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import { listMyGallery } from "@/lib/social/gallery";
import { listFeed, type FeedFilter } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Сообщество" };

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "news", label: "Новости" },
  { id: "posts", label: "Публикации" },
];

const OK_TEXTS = {
  posted: "Опубликовано.",
  deleted: "Публикация удалена.",
  pinned: "Закрепление изменено.",
  liked: "Готово.",
  reported: "Жалоба отправлена. Модерация рассмотрит её в течение суток.",
};

export default async function SocialPage({
  searchParams,
}: PageProps<"/social">) {
  await requireFlag("ff_p1a");
  const sp = await searchParams;
  const filter: FeedFilter = sp.f === "news" || sp.f === "posts" ? sp.f : "all";
  const page = Math.max(0, Number.parseInt(String(sp.p ?? "0"), 10) || 0);
  const viewer = await getViewer();
  const feed = await safely(
    "social feed",
    () => listFeed(viewer, filter, page),
    null,
  );
  const gallery = viewer.canPublish
    ? await safely("my gallery", () => listMyGallery(viewer.userId!), [])
    : [];
  const href = (f: FeedFilter, p = 0) => {
    const q = new URLSearchParams();
    if (f !== "all") q.set("f", f);
    if (p > 0) q.set("p", String(p));
    const s = q.toString();
    return `/social${s ? `?${s}` : ""}`;
  };
  const back = href(filter, page);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="eyebrow">Сообщество</p>
      <h1 className="mt-2 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Что нового в MineOrt
      </h1>
      <p className="text-ink-muted mt-2">
        Новости сервера и истории игроков: постройки, находки, планы.
      </p>

      <nav
        aria-label="Фильтр ленты"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href(f.id)}
            aria-current={filter === f.id ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              filter === f.id
                ? "bg-brand-600 text-on-brand"
                : "border-line hover:bg-brand-50 border"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <Link
          href="/social/gallery"
          className="text-brand-700 ml-auto text-sm font-semibold underline underline-offset-4"
        >
          Галерея
        </Link>
      </nav>

      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} ok={sp.ok} okTexts={OK_TEXTS} />

        {viewer.canPublish ? (
          <Composer viewer={viewer} gallery={gallery} back={back} />
        ) : viewer.cls === "guest" ? (
          <div className="border-line bg-surface flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm">
            <p>
              Гостям доступны официальные новости. Войдите, чтобы читать
              публикации игроков.
            </p>
            <ButtonLink href="/login" className="min-h-11 px-5 text-sm">
              Войти через Telegram
            </ButtonLink>
          </div>
        ) : (
          <p className="border-line bg-surface rounded-2xl border p-4 text-sm">
            {viewer.cls === "restricted"
              ? "Твой допуск приостановлен: доступны только открытые публикации."
              : "Публиковать могут участники сервера. Получи допуск, и здесь появится форма публикации."}{" "}
            {viewer.cls === "user" && (
              <Link
                href="/onboarding/minecraft"
                className="text-brand-700 font-semibold underline underline-offset-4"
              >
                Получить допуск
              </Link>
            )}
          </p>
        )}

        {feed === null ? (
          <ErrorState
            title="Не удалось загрузить ленту"
            description="Это временная ошибка. Обновите страницу через минуту."
          />
        ) : feed.posts.length === 0 ? (
          <EmptyState
            title={filter === "news" ? "Новостей пока нет" : "Здесь пока тихо"}
            description={
              viewer.canPublish
                ? "Опубликуй первую запись: покажи скриншот или расскажи о планах."
                : "Как только появятся публикации, они будут здесь."
            }
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {feed.posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} viewer={viewer} back={back} />
              </li>
            ))}
          </ol>
        )}

        {feed && (page > 0 || feed.hasMore) && (
          <div className="flex items-center justify-between">
            {page > 0 ? (
              <Link
                href={href(filter, page - 1)}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                ← Новее
              </Link>
            ) : (
              <span />
            )}
            {feed.hasMore && (
              <Link
                href={href(filter, page + 1)}
                className="text-brand-700 min-h-11 py-2 font-semibold underline underline-offset-4"
              >
                Старше →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
