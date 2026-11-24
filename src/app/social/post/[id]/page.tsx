import Link from "next/link";
import { notFound } from "next/navigation";
import { PostCard } from "@/components/social/post-card";
import { discussionsEnabled } from "@/lib/community/discussions";
import { getFeedPost } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";

export const metadata = {
  title: "Публикация MineOrt",
  description: "Откройте публикацию на MineOrt.",
};

export default async function PostPage({
  params,
}: PageProps<"/social/post/[id]">) {
  if (!discussionsEnabled()) notFound();
  const [{ id }, viewer] = await Promise.all([params, getViewer()]);
  const post = await getFeedPost(viewer, id);
  if (!post) notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/social" className="text-brand-700 text-sm underline">
        ← Лента
      </Link>
      <h1 className="sr-only">Публикация</h1>
      <PostCard
        post={post}
        viewer={viewer}
        back={`/social/post/${id}`}
        advanced
      />
    </div>
  );
}
