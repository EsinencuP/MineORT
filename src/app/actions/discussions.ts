"use server";

import { notFound, redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth/session-policy";
import {
  addComment,
  discussionsEnabled,
  getComment,
  threadPath,
  threadType,
  threadVisible,
} from "@/lib/community/discussions";
import { EVENT_ID } from "@/lib/social/events";
import { getMarker, getMarkerViewer } from "@/lib/map/markers";
import { getGalleryItem } from "@/lib/social/gallery";
import { SocialError } from "@/lib/social/errors";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function actor() {
  if (!discussionsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  return { ...viewer, userId: viewer.userId };
}

export async function addCommentAction(form: FormData) {
  const viewer = await actor();
  const type = str(form, "type");
  const id = str(form, "target");
  if (!threadType(type) || !EVENT_ID.test(id)) notFound();
  let destination: string;
  try {
    destination = await addComment(
      viewer,
      type,
      id,
      str(form, "body"),
      str(form, "parent") || null,
      form.has("pinned"),
    );
  } catch (error) {
    if (!(error instanceof SocialError)) throw error;
    destination = `${threadPath(type, id)}?error=${encodeURIComponent(error.code)}`;
  }
  redirect(destination);
}

export async function readThreadAction(form: FormData) {
  const viewer = await actor();
  const type = str(form, "type");
  const id = str(form, "target");
  if (!threadType(type) || !(await threadVisible(viewer, type, id))) notFound();
  const { error } = await db().from("community_thread_reads").upsert({
    user_id: viewer.userId,
    target_type: type,
    target_id: id,
    read_at: new Date().toISOString(),
  });
  if (error) throw new Error(`thread read: ${error.message}`);
  redirect(threadPath(type, id));
}

export async function reportCommentAction(form: FormData) {
  const viewer = await actor();
  const comment = await getComment(viewer, str(form, "comment"));
  if (!comment || comment.author_id === viewer.userId) notFound();
  const back = threadPath(comment.target_type, comment.target_id);
  const reason = str(form, "reason").slice(0, 500);
  if (reason.length < 3) redirect(`${back}?error=reason_too_short`);
  const { error } = await db().from("moderation_reports").insert({
    reporter_id: viewer.userId,
    target_id: comment.id,
    target_type: "comment",
    reason,
  });
  if (error?.code === "23505") redirect(`${back}?error=report_duplicate`);
  if (error) throw new Error(`comment report: ${error.message}`);
  redirect(`${back}?ok=reported`);
}

export async function reactPostAction(form: FormData) {
  const viewer = await actor();
  const id = str(form, "post_id");
  const kind = str(form, "kind");
  if (
    viewer.cls === "restricted" ||
    !EVENT_ID.test(id) ||
    !["like", "fire", "build", "wow"].includes(kind)
  )
    notFound();
  const { error } = await db().rpc("community_react", {
    p_user: viewer.userId,
    p_post: id,
    p_kind: kind,
  });
  if (error?.code === "P0001") notFound();
  if (error) throw new Error(`post reaction: ${error.message}`);
  redirect(safeReturnTo(str(form, "return_to")));
}

export async function followAction(form: FormData) {
  const viewer = await actor();
  const id = str(form, "target");
  const type = str(form, "type");
  if (
    !EVENT_ID.test(id) ||
    !["author", "guild", "project"].includes(type) ||
    viewer.cls === "restricted"
  )
    notFound();
  const follow = db().from("community_follows");
  const remove = form.get("remove") === "1";
  if (!remove) {
    const table =
      type === "author" ? "users" : type === "guild" ? "guilds" : "projects";
    const q = db().from(table).select("id").eq("id", id);
    const { data, error } = await (
      type === "author"
        ? q.eq("account_status", "active")
        : type === "guild"
          ? q.eq("status", "active")
          : q.neq("status", "cancelled")
    ).maybeSingle();
    if (error) throw new Error(`follow target lookup: ${error.message}`);
    if (!data) notFound();
  }
  const { error } = remove
    ? await follow
        .delete()
        .eq("user_id", viewer.userId)
        .eq("target_type", type)
        .eq("target_id", id)
    : await follow.upsert({
        user_id: viewer.userId,
        target_type: type,
        target_id: id,
      });
  if (error) throw new Error(`update follow: ${error.message}`);
  redirect(safeReturnTo(str(form, "return_to")));
}

export async function bookmarkAction(form: FormData) {
  const viewer = await actor();
  const type = str(form, "type");
  const id = str(form, "target");
  if (
    !EVENT_ID.test(id) ||
    !["post", "media", "marker"].includes(type) ||
    viewer.cls === "restricted"
  )
    notFound();
  const table = db().from("community_bookmarks");
  const remove = form.get("remove") === "1";
  if (!remove) {
    const visible =
      type === "post"
        ? await threadVisible(viewer, "post", id)
        : type === "media"
          ? await getGalleryItem(viewer, id)
          : await getMarker(await getMarkerViewer(), id);
    if (!visible) notFound();
  }
  const { error } = remove
    ? await table
        .delete()
        .eq("user_id", viewer.userId)
        .eq("target_type", type)
        .eq("target_id", id)
    : await table.upsert({
        user_id: viewer.userId,
        target_type: type,
        target_id: id,
      });
  if (error) throw new Error(`update bookmark: ${error.message}`);
  redirect(safeReturnTo(str(form, "return_to")));
}
