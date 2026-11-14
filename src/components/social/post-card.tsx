import {
  deletePostAction,
  likePostAction,
  pinPostAction,
  reportPostAction,
} from "@/app/actions/social";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MinecraftAvatar } from "@/components/portal/minecraft-avatar";
import type { FeedPost } from "@/lib/social/store";
import type { Viewer } from "@/lib/social/viewer";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Chisinau",
  }).format(new Date(iso));

const HeartIcon = ({ on }: { on: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="size-5"
    fill={on ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
    shapeRendering="crispEdges"
  >
    <path d="M4 8h4V6h2v2h4V6h2v2h4v4h-2v2h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4z" />
  </svg>
);

export function PostCard({
  post,
  viewer,
  back,
}: {
  post: FeedPost;
  viewer: Viewer;
  back: string;
}) {
  const canInteract = viewer.cls !== "guest" && viewer.cls !== "restricted";
  const canDelete = post.mine || viewer.canModerate;
  return (
    <Card className="flex flex-col gap-3" data-post-id={post.id}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <MinecraftAvatar nick={post.author.nick} size={40} />
        <div className="min-w-[8rem] flex-1">
          <p className="truncate font-semibold">{post.author.name}</p>
          <p className="text-ink-muted text-xs">
            <time dateTime={post.createdAt}>{fmt(post.createdAt)}</time>
            {post.editedAt && " · изменено"}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:justify-end">
          {post.kind === "news" && (
            <StatusBadge tone="info">Новость</StatusBadge>
          )}
          {post.pinned && <StatusBadge tone="warn">Закреплено</StatusBadge>}
          {post.visibility === "private" && <StatusBadge>Только я</StatusBadge>}
        </div>
      </header>

      <p className="leading-relaxed break-words whitespace-pre-line">
        {post.body}
      </p>

      {post.images.length > 0 && (
        <ul
          className={`grid gap-2 ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {post.images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${img.id}`}
                alt="Изображение к публикации"
                width={img.width}
                height={img.height}
                loading="lazy"
                className="bg-surface max-h-[28rem] w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="border-line flex flex-wrap items-center gap-2 border-t pt-3">
        {canInteract ? (
          <form action={likePostAction}>
            <input type="hidden" name="post_id" value={post.id} />
            <input type="hidden" name="return_to" value={back} />
            <button
              type="submit"
              aria-pressed={post.liked}
              aria-label={post.liked ? "Убрать отметку «нравится»" : "Нравится"}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${
                post.liked ? "bg-brand-600 text-on-brand" : "hover:bg-brand-50"
              }`}
            >
              <HeartIcon on={post.liked} /> {post.likes}
            </button>
          </form>
        ) : (
          <span className="text-ink-muted inline-flex min-h-11 items-center gap-1.5 px-3 text-sm">
            <HeartIcon on={false} /> {post.likes}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {viewer.canModerate && post.kind === "news" && (
            <form action={pinPostAction}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="pin" value={post.pinned ? "0" : "1"} />
              <input type="hidden" name="return_to" value={back} />
              <button
                type="submit"
                className="hover:bg-brand-50 min-h-11 rounded-full px-3 text-sm"
              >
                {post.pinned ? "Открепить" : "Закрепить"}
              </button>
            </form>
          )}
          {canInteract && !post.mine && (
            <details className="relative">
              <summary className="text-ink-muted hover:bg-brand-50 flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm">
                Пожаловаться
              </summary>
              <form
                action={reportPostAction}
                className="border-line bg-paper absolute right-0 bottom-full z-10 mb-2 flex w-72 max-w-[80vw] flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-card)]"
              >
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="return_to" value={back} />
                <label className="text-sm font-medium" htmlFor={`r-${post.id}`}>
                  Что не так?
                </label>
                <textarea
                  id={`r-${post.id}`}
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  className="bg-paper text-ink border-line rounded-xl border px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="bg-brand-600 text-on-brand min-h-11 rounded-full px-4 text-sm font-semibold"
                >
                  Отправить жалобу
                </button>
              </form>
            </details>
          )}
          {canDelete && (
            <details className="relative">
              <summary className="text-danger hover:bg-danger-bg flex min-h-11 cursor-pointer list-none items-center rounded-full px-3 text-sm">
                Удалить
              </summary>
              <form
                action={deletePostAction}
                className="border-line bg-paper absolute right-0 bottom-full z-10 mb-2 flex w-64 flex-col gap-2 rounded-2xl border p-3 shadow-[var(--shadow-card)]"
              >
                <input type="hidden" name="post_id" value={post.id} />
                <input type="hidden" name="return_to" value={back} />
                {!post.mine && (
                  <>
                    <label
                      className="text-sm font-medium"
                      htmlFor={`d-${post.id}`}
                    >
                      Причина
                    </label>
                    <input
                      id={`d-${post.id}`}
                      name="reason"
                      required
                      minLength={3}
                      className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm"
                    />
                  </>
                )}
                <p className="text-ink-muted text-xs">
                  Публикация исчезнет сразу, изображения удалятся через 30 дней.
                </p>
                <button
                  type="submit"
                  className="bg-danger text-on-danger min-h-11 rounded-full px-4 text-sm font-semibold"
                >
                  Удалить публикацию
                </button>
              </form>
            </details>
          )}
        </div>
      </footer>
    </Card>
  );
}
