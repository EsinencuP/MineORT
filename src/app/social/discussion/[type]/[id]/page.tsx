import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addCommentAction,
  readThreadAction,
  reportCommentAction,
} from "@/app/actions/discussions";
import { MuteControl } from "@/components/social/thread-controls";
import { PendingButton } from "@/components/social/pending-button";
import { LocalTime } from "@/components/social/local-time";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  discussionsEnabled,
  getThread,
  threadType,
} from "@/lib/community/discussions";
import {
  mutedScopes,
  notificationsEnabled,
} from "@/lib/community/notifications";
import { getViewer } from "@/lib/social/viewer";

export const metadata = { title: "Обсуждение MineOrt" };
const TEXTAREA = "border-line bg-paper w-full rounded-xl border p-3 text-sm";

function CommentForm({
  type,
  id,
  parent,
}: {
  type: string;
  id: string;
  parent?: string;
}) {
  return (
    <form action={addCommentAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="target" value={id} />
      {parent && <input type="hidden" name="parent" value={parent} />}
      <label className="w-full text-sm">
        {parent ? "Ваш ответ" : "Ваш комментарий"}
        <textarea
          name="body"
          required
          maxLength={1500}
          rows={3}
          className={TEXTAREA}
        />
      </label>
      {type === "guild" && !parent && (
        <label className="text-sm">
          <input type="checkbox" name="pinned" /> Закрепить (руководство
          гильдии)
        </label>
      )}
      <PendingButton>{parent ? "Ответить" : "Опубликовать"}</PendingButton>
    </form>
  );
}

export default async function DiscussionPage({
  params,
  searchParams,
}: PageProps<"/social/discussion/[type]/[id]">) {
  if (!discussionsEnabled()) notFound();
  const [{ type, id }, viewer, feedback] = await Promise.all([
    params,
    getViewer(),
    searchParams,
  ]);
  if (!threadType(type)) notFound();
  const focus = typeof feedback.focus === "string" ? feedback.focus : undefined;
  const thread = await getThread(viewer, type, id, focus);
  if (!thread) notFound();
  const scope = `${type}:${id}`;
  const muted =
    viewer.userId && notificationsEnabled()
      ? await mutedScopes(viewer.userId)
      : null;
  const unread = viewer.userId
    ? thread.comments.filter((comment) => comment.unread).length
    : 0;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link
        href={
          type === "post"
            ? `/social/post/${id}`
            : type === "event"
              ? `/social/calendar/${id}`
              : type === "project"
                ? `/social/projects/${id}`
                : "/players?tab=guilds"
        }
        className="text-brand-700 text-sm underline"
      >
        ← Назад
      </Link>
      <h1 className="text-3xl">
        {type === "guild" ? "Доска объявлений" : "Обсуждение"}
      </h1>
      <Notice
        error={feedback.error}
        ok={feedback.ok}
        okTexts={{ reported: "Жалоба отправлена." }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {unread > 0 && (
          <form action={readThreadAction}>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="target" value={id} />
            <PendingButton variant="ghost">
              Прочитать новые ({unread})
            </PendingButton>
          </form>
        )}
        {muted && (
          <MuteControl
            scope={scope}
            muted={muted.has(scope)}
            back={`/social/discussion/${type}/${id}`}
          />
        )}
      </div>
      {viewer.canPublish && (
        <Card>
          <CommentForm type={type} id={id} />
        </Card>
      )}
      {thread.comments.length === 0 && (
        <p className="text-ink-muted text-sm">Сообщений пока нет.</p>
      )}
      {thread.comments.map((comment) => (
        <Card
          key={comment.id}
          id={`comment-${comment.id}`}
          className="flex scroll-mt-24 flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>{comment.author}</strong>
            <LocalTime iso={comment.created_at} />
            {comment.pinned && (
              <StatusBadge tone="warn">Закреплено</StatusBadge>
            )}
            {viewer.userId && comment.unread && (
              <StatusBadge tone="info">Новое</StatusBadge>
            )}
            <Link
              href={`?focus=${comment.id}#comment-${comment.id}`}
              className="text-brand-700 ml-auto underline"
            >
              Ссылка
            </Link>
          </div>
          {comment.parent_id && (
            <Link
              href={`?focus=${comment.parent_id}#comment-${comment.parent_id}`}
              className="text-brand-700 text-xs underline"
            >
              К исходному сообщению
            </Link>
          )}
          <p className="break-words whitespace-pre-wrap">{comment.body}</p>
          {viewer.canPublish && (
            <details>
              <summary className="text-brand-700 min-h-8 cursor-pointer text-sm">
                Ответить
              </summary>
              <CommentForm type={type} id={id} parent={comment.id} />
            </details>
          )}
          {viewer.userId && comment.author_id !== viewer.userId && (
            <details>
              <summary className="text-ink-muted min-h-8 cursor-pointer text-sm">
                Пожаловаться
              </summary>
              <form
                action={reportCommentAction}
                className="flex flex-col items-start gap-2"
              >
                <input type="hidden" name="comment" value={comment.id} />
                <textarea
                  name="reason"
                  aria-label="Причина жалобы"
                  required
                  minLength={3}
                  maxLength={500}
                  className={TEXTAREA}
                />
                <PendingButton variant="ghost">Отправить жалобу</PendingButton>
              </form>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
