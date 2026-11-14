import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import {
  MAX_IMAGES_PER_POST,
  discardMedia,
  ingestUploads,
  releaseUnusedMedia,
  type MediaRow,
} from "./media";
import { canSeePost, type Viewer } from "./viewer";

export const PAGE_SIZE = 20;
export type FeedFilter = "all" | "news" | "posts";

export type FeedPost = {
  id: string;
  kind: "post" | "news";
  body: string;
  visibility: string;
  pinned: boolean;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; name: string; nick: string | null };
  images: { id: string; width: number; height: number }[];
  likes: number;
  liked: boolean;
  mine: boolean;
};

async function withinLimit(key: string, windowSeconds: number, limit: number) {
  const { data, error } = await db().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });
  if (error) throw new Error(`hit_rate_limit: ${error.message}`);
  return data === true;
}

async function authorsOf(ids: string[]) {
  const map = new Map<
    string,
    { id: string; name: string; nick: string | null }
  >();
  if (ids.length === 0) return map;
  const [{ data: users }, { data: nicks }, { data: tgs }] = await Promise.all([
    db().from("users").select("id, display_name").in("id", ids),
    db()
      .from("minecraft_identities")
      .select("user_id, nickname")
      .in("user_id", ids)
      .in("binding_status", ["reserved", "confirmed"]),
    db()
      .from("telegram_identities")
      .select("user_id, username")
      .in("user_id", ids),
  ]);
  const nickOf = new Map(
    (nicks ?? []).map((n) => [n.user_id, n.nickname as string]),
  );
  const tgOf = new Map(
    (tgs ?? []).map((t) => [t.user_id, t.username as string | null]),
  );
  for (const u of users ?? []) {
    const nick = nickOf.get(u.id) ?? null;
    map.set(u.id as string, {
      id: u.id as string,
      nick,
      name:
        nick ?? (u.display_name as string | null) ?? tgOf.get(u.id) ?? "Игрок",
    });
  }
  return map;
}

/** Turns raw post rows into cards: authors, images, reaction counts. */
async function hydrate(
  rows: Record<string, unknown>[],
  viewer: Viewer,
): Promise<FeedPost[]> {
  const ids = rows.map((r) => r.id as string);
  const [authors, atts, likes] = await Promise.all([
    authorsOf([...new Set(rows.map((r) => r.author_id as string))]),
    ids.length
      ? db()
          .from("media_attachments")
          .select(
            "target_id, position, media:media_id (id, width, height, deleted_at, moderation_status)",
          )
          .eq("target_type", "post")
          .in("target_id", ids)
          .order("position")
      : Promise.resolve({ data: [] }),
    ids.length
      ? db().from("reactions").select("post_id, user_id").in("post_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const imagesOf = new Map<string, FeedPost["images"]>();
  for (const a of (atts.data ?? []) as unknown as {
    target_id: string;
    media: {
      id: string;
      width: number;
      height: number;
      deleted_at: string | null;
      moderation_status: string;
    } | null;
  }[]) {
    if (
      !a.media ||
      a.media.deleted_at ||
      a.media.moderation_status !== "approved"
    )
      continue;
    const list = imagesOf.get(a.target_id) ?? [];
    list.push({ id: a.media.id, width: a.media.width, height: a.media.height });
    imagesOf.set(a.target_id, list);
  }
  const likeCount = new Map<string, number>();
  const liked = new Set<string>();
  for (const l of (likes.data ?? []) as {
    post_id: string;
    user_id: string;
  }[]) {
    likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    if (l.user_id === viewer.userId) liked.add(l.post_id);
  }
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as "post" | "news",
    body: r.body as string,
    visibility: r.visibility as string,
    pinned: r.pinned as boolean,
    createdAt: r.created_at as string,
    editedAt: (r.edited_at as string | null) ?? null,
    author: authors.get(r.author_id as string) ?? {
      id: r.author_id as string,
      name: "Игрок",
      nick: null,
    },
    images: imagesOf.get(r.id as string) ?? [],
    likes: likeCount.get(r.id as string) ?? 0,
    liked: liked.has(r.id as string),
    mine: r.author_id === viewer.userId,
  }));
}

/** The feed as this viewer is allowed to see it (SC-SOC-06): the filter is applied in the query. */
export async function listFeed(
  viewer: Viewer,
  filter: FeedFilter,
  page = 0,
): Promise<{ posts: FeedPost[]; hasMore: boolean }> {
  let q = db()
    .from("posts")
    .select(
      "id, author_id, kind, body, visibility, pinned, created_at, edited_at",
    )
    .eq("moderation_status", "approved")
    .is("deleted_at", null);
  if (viewer.cls === "guest")
    q = q.eq("kind", "news").eq("visibility", "public");
  else if (viewer.cls === "member" || viewer.cls === "staff")
    q = q.or(
      `visibility.eq.public,and(visibility.eq.private,author_id.eq.${viewer.userId})`,
    );
  else q = q.eq("visibility", "public");
  if (filter === "news") q = q.eq("kind", "news");
  if (filter === "posts") q = q.eq("kind", "post");
  const from = page * PAGE_SIZE;
  const { data, error } = await q
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE); // one extra row tells whether there is a next page
  if (error) throw new Error(`feed: ${error.message}`);
  const rows = data ?? [];
  return {
    posts: await hydrate(rows.slice(0, PAGE_SIZE), viewer),
    hasMore: rows.length > PAGE_SIZE,
  };
}

/** Latest official news for the dashboard (public, no personal data). */
export async function latestNews(limit = 4) {
  const { data } = await db()
    .from("posts")
    .select("id, body, created_at")
    .eq("kind", "news")
    .eq("visibility", "public")
    .eq("moderation_status", "approved")
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; body: string; created_at: string }[];
}

export type NewPost = {
  body: string;
  kind: "post" | "news";
  visibility: "public" | "private";
  pinned: boolean;
  incomingPaths: string[];
  galleryMediaIds: string[];
};

export async function createPost(viewer: Viewer, input: NewPost) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("post_forbidden");
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000)
    throw new SocialError("post_empty");
  if (input.kind === "news" && !viewer.canModerate)
    throw new SocialError("news_forbidden");
  const kind = input.kind;
  const visibility = kind === "news" ? "public" : input.visibility;
  const pinned = kind === "news" && viewer.canModerate && input.pinned;
  const galleryIds = [...new Set(input.galleryMediaIds)];
  if (input.incomingPaths.length + galleryIds.length > MAX_IMAGES_PER_POST)
    throw new SocialError("too_many_images");
  if (!(await withinLimit(`post:${viewer.userId}`, 3600, 10)))
    throw new SocialError("post_rate_limited");

  // gallery images may only be reused by their owner
  if (galleryIds.length > 0) {
    const { data } = await db()
      .from("media")
      .select("id")
      .in("id", galleryIds)
      .eq("uploader_id", viewer.userId)
      .is("deleted_at", null);
    if ((data ?? []).length !== galleryIds.length)
      throw new SocialError("media_not_found");
  }

  // upload checks come first: nothing is published when a file is refused (SC-SOC-05)
  let uploaded: MediaRow[] = [];
  try {
    uploaded = await ingestUploads(
      viewer.userId,
      input.incomingPaths,
      visibility,
    );
    const { data: post, error } = await db()
      .from("posts")
      .insert({ author_id: viewer.userId, kind, body, visibility, pinned })
      .select("id")
      .single();
    if (error || !post) throw new Error(`post insert: ${error?.message}`);
    const mediaIds = [...uploaded.map((m) => m.id), ...galleryIds];
    if (mediaIds.length > 0) {
      const { error: attErr } = await db()
        .from("media_attachments")
        .insert(
          mediaIds.map((id, i) => ({
            media_id: id,
            target_type: "post",
            target_id: post.id,
            position: i,
          })),
        );
      if (attErr) {
        await db().from("posts").delete().eq("id", post.id);
        throw new Error(`attachments: ${attErr.message}`);
      }
    }
    if (kind === "news")
      await writeAudit(viewer.userId, "news.published", {
        post_id: post.id,
        pinned,
      });
    return post.id as string;
  } catch (e) {
    await discardMedia(uploaded);
    throw e;
  }
}

async function loadPost(id: string) {
  const { data } = await db()
    .from("posts")
    .select(
      "id, author_id, kind, visibility, moderation_status, deleted_at, pinned",
    )
    .eq("id", id)
    .maybeSingle();
  return data as {
    id: string;
    author_id: string;
    kind: string;
    visibility: string;
    moderation_status: string;
    deleted_at: string | null;
    pinned: boolean;
  } | null;
}

/** Soft delete by the author or a moderator; images lose their link at once, files go after 30 days. */
export async function deletePost(
  viewer: Viewer,
  postId: string,
  reason?: string,
) {
  if (!viewer.userId) throw new SocialError("post_forbidden");
  const post = await loadPost(postId);
  if (!post || post.deleted_at) throw new SocialError("post_not_found");
  const own = post.author_id === viewer.userId;
  if (!own && !viewer.canModerate) throw new SocialError("post_not_found"); // no hint that it exists
  if (!own && (reason ?? "").trim().length < 3)
    throw new SocialError("reason_too_short");
  await db()
    .from("posts")
    .update({ deleted_at: new Date().toISOString(), pinned: false })
    .eq("id", postId);
  const { data: atts } = await db()
    .from("media_attachments")
    .select("media_id")
    .eq("target_type", "post")
    .eq("target_id", postId);
  await db()
    .from("media_attachments")
    .delete()
    .eq("target_type", "post")
    .eq("target_id", postId);
  await releaseUnusedMedia((atts ?? []).map((a) => a.media_id as string));
  await writeAudit(viewer.userId, "post.deleted", {
    post_id: postId,
    by: own ? "author" : "moderator",
    reason: reason ?? null,
  });
}

export async function setPinned(
  viewer: Viewer,
  postId: string,
  pinned: boolean,
) {
  if (!viewer.userId || !viewer.canModerate)
    throw new SocialError("news_forbidden");
  const post = await loadPost(postId);
  if (!post || post.deleted_at || post.kind !== "news")
    throw new SocialError("post_not_found");
  await db().from("posts").update({ pinned }).eq("id", postId);
  await writeAudit(viewer.userId, pinned ? "post.pinned" : "post.unpinned", {
    post_id: postId,
  });
}

/** Toggles the like; returns the new state. */
export async function toggleLike(viewer: Viewer, postId: string) {
  if (!viewer.userId || viewer.cls === "guest" || viewer.cls === "restricted")
    throw new SocialError("post_forbidden");
  const post = await loadPost(postId);
  if (
    !post ||
    post.deleted_at ||
    post.moderation_status !== "approved" ||
    !canSeePost(viewer, post)
  )
    throw new SocialError("post_not_found");
  const { data: removed } = await db()
    .from("reactions")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", viewer.userId)
    .eq("kind", "like")
    .select("post_id");
  if ((removed ?? []).length > 0) return false;
  await db()
    .from("reactions")
    .upsert(
      { post_id: postId, user_id: viewer.userId, kind: "like" },
      { onConflict: "post_id,user_id,kind", ignoreDuplicates: true },
    );
  return true;
}

export async function reportPost(
  viewer: Viewer,
  postId: string,
  reason: string,
) {
  if (!viewer.userId || viewer.cls === "guest")
    throw new SocialError("post_forbidden");
  const text = reason.trim();
  if (text.length < 3) throw new SocialError("reason_too_short");
  const post = await loadPost(postId);
  if (
    !post ||
    post.deleted_at ||
    post.moderation_status !== "approved" ||
    !canSeePost(viewer, post)
  )
    throw new SocialError("post_not_found");
  if (post.author_id === viewer.userId) throw new SocialError("report_own");
  const { error } = await db()
    .from("moderation_reports")
    .insert({
      reporter_id: viewer.userId,
      target_type: "post",
      target_id: postId,
      reason: text.slice(0, 500),
    });
  if (error?.code === "23505") throw new SocialError("report_duplicate");
  if (error) throw new Error(`report insert: ${error.message}`);
}

/* ---------------- moderation queue ---------------- */

export async function listOpenReports() {
  const { data, error } = await db()
    .from("moderation_reports")
    .select("id, reporter_id, target_id, reason, created_at")
    .eq("status", "open")
    .order("created_at");
  if (error) throw new Error(`reports: ${error.message}`);
  const reports = data ?? [];
  const postIds = [...new Set(reports.map((r) => r.target_id as string))];
  const { data: posts } = postIds.length
    ? await db()
        .from("posts")
        .select(
          "id, author_id, body, kind, visibility, moderation_status, deleted_at, created_at",
        )
        .in("id", postIds)
    : { data: [] };
  const authors = await authorsOf([
    ...new Set((posts ?? []).map((p) => p.author_id as string)),
  ]);
  const byId = new Map((posts ?? []).map((p) => [p.id as string, p]));
  return reports.map((r) => {
    const p = byId.get(r.target_id as string);
    return {
      id: r.id as string,
      reason: r.reason as string,
      createdAt: r.created_at as string,
      postId: r.target_id as string,
      postBody: (p?.body as string | undefined) ?? "",
      postKind: (p?.kind as string | undefined) ?? "post",
      postState: p?.deleted_at
        ? "deleted"
        : ((p?.moderation_status as string | undefined) ?? "gone"),
      author: p ? (authors.get(p.author_id as string)?.name ?? "Игрок") : "—",
    };
  });
}

/** Decision on a report: hide the post, delete it, or keep it (dismiss). Same target = all reports closed. */
export async function decideReport(
  viewer: Viewer,
  reportId: string,
  decision: "hide" | "delete" | "dismiss",
  note: string,
) {
  if (!viewer.userId || !viewer.canModerate) throw new SocialError("forbidden");
  const reason = note.trim();
  if (decision !== "dismiss" && reason.length < 3)
    throw new SocialError("reason_too_short");
  const { data: rep } = await db()
    .from("moderation_reports")
    .select("id, target_id, status")
    .eq("id", reportId)
    .maybeSingle();
  if (!rep) throw new SocialError("report_not_found");
  if (rep.status !== "open") throw new SocialError("report_closed");
  const postId = rep.target_id as string;

  if (decision === "hide") {
    await db()
      .from("posts")
      .update({
        moderation_status: "hidden",
        moderation_reason: reason,
        pinned: false,
      })
      .eq("id", postId);
  } else if (decision === "delete") {
    await deletePost(viewer, postId, reason).catch((e) => {
      if (!(e instanceof SocialError && e.code === "post_not_found")) throw e;
    });
  }
  await db()
    .from("moderation_reports")
    .update({
      status: decision === "dismiss" ? "dismissed" : "actioned",
      decided_by: viewer.userId,
      decided_at: new Date().toISOString(),
      decision_note: reason || null,
    })
    .eq("target_type", "post")
    .eq("target_id", postId)
    .eq("status", "open");
  await writeAudit(viewer.userId, `report.${decision}`, {
    report_id: reportId,
    post_id: postId,
    note: reason || null,
  });
}
