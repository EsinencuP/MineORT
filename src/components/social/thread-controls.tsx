import Link from "next/link";
import { toggleNotificationMuteAction } from "@/app/actions/notifications";
import { bookmarkAction, followAction } from "@/app/actions/discussions";
import { threadPath, type ThreadType } from "@/lib/community/discussions";
import { PendingButton } from "./pending-button";

export function ThreadLink({
  type,
  id,
  children = "Обсуждение",
}: {
  type: ThreadType;
  id: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={threadPath(type, id)}
      className="text-brand-700 inline-flex min-h-11 items-center text-sm underline"
    >
      {children}
    </Link>
  );
}

export function MuteControl({
  scope,
  muted,
  back,
}: {
  scope: string;
  muted: boolean;
  back: string;
}) {
  return (
    <form action={toggleNotificationMuteAction}>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="return_to" value={back} />
      <input type="hidden" name="unmute" value={muted ? "1" : "0"} />
      <PendingButton variant="ghost" className="px-3 text-sm">
        {muted ? "Включить уведомления" : "Заглушить тему"}
      </PendingButton>
    </form>
  );
}

export function FollowControl({
  type,
  id,
  following,
  back,
}: {
  type: "author" | "guild" | "project";
  id: string;
  following: boolean;
  back: string;
}) {
  return (
    <form action={followAction}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="target" value={id} />
      <input type="hidden" name="return_to" value={back} />
      <input type="hidden" name="remove" value={following ? "1" : "0"} />
      <PendingButton variant="ghost" className="px-3 text-sm">
        {following ? "Отписаться" : "Подписаться"}
      </PendingButton>
    </form>
  );
}

export function BookmarkControl({
  type,
  id,
  saved,
  back,
}: {
  type: "media" | "marker" | "post";
  id: string;
  saved: boolean;
  back: string;
}) {
  return (
    <form action={bookmarkAction}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="target" value={id} />
      <input type="hidden" name="return_to" value={back} />
      <input type="hidden" name="remove" value={saved ? "1" : "0"} />
      <PendingButton variant="ghost" className="px-3 text-sm">
        {saved ? "Убрать закладку" : "В закладки"}
      </PendingButton>
    </form>
  );
}
