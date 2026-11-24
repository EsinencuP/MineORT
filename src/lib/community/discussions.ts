import "server-only";
import { isEnabled } from "@/lib/flags";
import { EVENT_ID } from "@/lib/social/events";
import { SocialError } from "@/lib/social/errors";
import { authorsOf } from "@/lib/social/store";
import type { Viewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

export const discussionsEnabled = () => isEnabled("ff_social_comments");
export type ThreadType = "post" | "event" | "project" | "guild";
export const threadType = (raw: string): raw is ThreadType =>
  ["post", "event", "project", "guild"].includes(raw);
export const threadPath = (type: ThreadType, id: string) =>
  `/social/discussion/${type}/${id}`;

export async function isFollowing(
  userId: string,
  type: "author" | "guild" | "project",
  targetId: string,
) {
  const { data, error } = await db()
    .from("community_follows")
    .select("target_id")
    .eq("user_id", userId)
    .eq("target_type", type)
    .eq("target_id", targetId)
    .maybeSingle();
  if (error) throw new Error(`follow state: ${error.message}`);
  return !!data;
}

export async function isBookmarked(
  userId: string,
  type: "media" | "marker",
  targetId: string,
) {
  const { data, error } = await db()
    .from("community_bookmarks")
    .select("target_id")
    .eq("user_id", userId)
    .eq("target_type", type)
    .eq("target_id", targetId)
    .maybeSingle();
  if (error) throw new Error(`bookmark state: ${error.message}`);
  return !!data;
}

export async function threadVisible(
  viewer: Viewer,
  type: ThreadType,
  id: string,
) {
  if (!EVENT_ID.test(id)) return false;
  if (type === "event" && !isEnabled("ff_p1b_social")) return false;
  if (type === "guild" && !isEnabled("ff_p1b_guilds")) return false;
  const { data, error } = await db().rpc("community_thread_visible", {
    uid: viewer.userId,
    p_type: type,
    tid: id,
  });
  if (error) throw new Error(`thread audience lookup: ${error.message}`);
  return data === true;
}

type Comment = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  target_type: ThreadType;
  target_id: string;
};

export async function getThread(
  viewer: Viewer,
  type: ThreadType,
  id: string,
  focus?: string,
) {
  if (!(await threadVisible(viewer, type, id))) return null;
  const [comments, read] = await Promise.all([
    db()
      .from("community_comments")
      .select("*")
      .eq("target_type", type)
      .eq("target_id", id)
      .is("hidden_at", null)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    viewer.userId
      ? db()
          .from("community_thread_reads")
          .select("read_at")
          .eq("user_id", viewer.userId)
          .eq("target_type", type)
          .eq("target_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (comments.error || read.error) throw new Error("discussion lookup failed");
  const rows = comments.data as Comment[];
  if (focus && EVENT_ID.test(focus) && !rows.some((row) => row.id === focus)) {
    const extra = await getComment(viewer, focus);
    if (extra?.target_type === type && extra.target_id === id) rows.push(extra);
  }
  const authors = await authorsOf([
    ...new Set(rows.map((row) => row.author_id)),
  ]);
  return {
    comments: rows.map((row) => ({
      ...row,
      author: authors.get(row.author_id)?.name ?? "Игрок",
      unread: !read.data || row.created_at > read.data.read_at,
    })),
  };
}

export async function getComment(
  viewer: Viewer,
  id: string,
): Promise<Comment | null> {
  if (!EVENT_ID.test(id)) return null;
  const { data, error } = await db()
    .from("community_comments")
    .select("*")
    .eq("id", id)
    .is("hidden_at", null)
    .maybeSingle();
  if (error) throw new Error(`comment lookup: ${error.message}`);
  if (!data || !(await threadVisible(viewer, data.target_type, data.target_id)))
    return null;
  return data as Comment;
}

export function commentPath(
  comment: Pick<Comment, "id" | "target_type" | "target_id">,
) {
  return `${threadPath(comment.target_type, comment.target_id)}?focus=${comment.id}#comment-${comment.id}`;
}

export async function addComment(
  viewer: Viewer,
  type: ThreadType,
  id: string,
  body: string,
  parent: string | null,
  pinned: boolean,
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("post_forbidden");
  if (!body || body.length > 1500 || (parent && !EVENT_ID.test(parent)))
    throw new SocialError("post_empty");
  if (!(await threadVisible(viewer, type, id)))
    throw new SocialError("thread_not_found");
  const mentions = [
    ...new Set(
      Array.from(
        body.matchAll(/(?:^|[^\w@])@([a-zA-Z0-9_]{3,16})(?!\w)/g),
        (m) => m[1].toLowerCase(),
      ),
    ),
  ].slice(0, 10);
  const { data, error } = await db().rpc("community_add_comment", {
    p_user: viewer.userId,
    p_type: type,
    p_target: id,
    p_body: body,
    p_parent: parent,
    p_mentions: mentions,
    p_pinned: pinned,
  });
  if (error) {
    if (error.code === "P0001") throw new SocialError(error.message);
    throw new Error(`comment insert: ${error.message}`);
  }
  return commentPath({ id: data, target_id: id, target_type: type });
}
