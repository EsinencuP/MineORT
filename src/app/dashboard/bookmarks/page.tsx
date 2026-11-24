import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bookmarkAction } from "@/app/actions/discussions";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { discussionsEnabled } from "@/lib/community/discussions";
import { isEnabled } from "@/lib/flags";
import { getMarker, getMarkerViewer } from "@/lib/map/markers";
import { getGalleryItem } from "@/lib/social/gallery";
import { getFeedPost } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

export const metadata = { title: "Закладки" };
const BACK = "/dashboard/bookmarks";

export default async function BookmarksPage() {
  if (!discussionsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  const { data, error } = await db()
    .from("community_bookmarks")
    .select("target_type, target_id")
    .eq("user_id", viewer.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`bookmarks: ${error.message}`);
  const mapViewer = isEnabled("ff_p1c_atlas") ? getMarkerViewer() : null;
  const targets = await Promise.all(
    data.map(async (row) => {
      const id = row.target_id as string;
      const type = row.target_type as string;
      if (type === "post") {
        const post = await getFeedPost(viewer, id);
        return {
          id,
          type,
          title: post?.body.slice(0, 100),
          href: `/social/post/${id}`,
        };
      }
      if (type === "media") {
        const media = await getGalleryItem(viewer, id);
        return {
          id,
          type,
          title: media ? media.item.caption || "Скриншот" : null,
          href: `/social/gallery/${id}`,
        };
      }
      const marker = mapViewer ? await getMarker(await mapViewer, id) : null;
      return { id, type, title: marker?.name, href: `/map?m=${id}` };
    }),
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/social" className="text-brand-700 text-sm underline">
        ← Лента
      </Link>
      <h1 className="text-3xl">Закладки</h1>
      {!targets.length && (
        <p className="text-ink-muted text-sm">
          Здесь появятся сохранённые публикации, снимки и метки.
        </p>
      )}
      {targets.map((target) => (
        <Card
          className="flex flex-wrap items-center justify-between gap-2"
          key={`${target.type}:${target.id}`}
        >
          {target.title ? (
            <Link
              href={target.href}
              className="text-brand-700 break-words underline"
            >
              {target.title}
            </Link>
          ) : (
            <span className="text-ink-muted text-sm">Объект недоступен</span>
          )}
          <form action={bookmarkAction}>
            <input type="hidden" name="type" value={target.type} />
            <input type="hidden" name="target" value={target.id} />
            <input type="hidden" name="return_to" value={BACK} />
            <input type="hidden" name="remove" value="1" />
            <PendingButton variant="ghost">Убрать</PendingButton>
          </form>
        </Card>
      ))}
    </div>
  );
}
