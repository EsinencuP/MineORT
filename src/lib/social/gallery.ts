import "server-only";
import { writeAudit } from "@/lib/audit";
import { userIdByNick } from "@/lib/guilds/store";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import { discardUnpublishedMedia, ingestUploads, storageUsage } from "./media";
import type { Viewer } from "./viewer";

export const GALLERY_PAGE = 24;

export const CATEGORIES = {
  build: "Постройки",
  landscape: "Пейзажи",
  event: "События",
  funny: "Забавное",
  other: "Другое",
} as const;
export type Category = keyof typeof CATEGORIES;
export const isCategory = (v: string): v is Category => v in CATEGORIES;

export type GalleryItem = {
  id: string;
  width: number;
  height: number;
  visibility: string;
  createdAt: string;
  caption: string;
  category: Category;
  /** Hidden by a moderator (only the owner and staff can still see the entry). */
  hidden: boolean;
  hiddenReason: string | null;
  ownerId: string;
  owner: string;
};

export type GalleryFilter = {
  author?: string;
  category?: string;
  since?: string;
  sort?: string;
  page?: number;
};

type Row = {
  caption: string;
  category: string;
  created_at: string;
  media: {
    id: string;
    uploader_id: string;
    width: number;
    height: number;
    visibility: string;
    moderation_status: string;
    moderation_reason: string | null;
    deleted_at: string | null;
    created_at: string;
  } | null;
};

const SELECT =
  "caption, category, created_at, media:media_id!inner(id, uploader_id, width, height, visibility, moderation_status, moderation_reason, deleted_at, created_at)";

async function ownerNames(ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const [{ data: users }, { data: nicks }] = await Promise.all([
    db().from("users").select("id, display_name").in("id", ids),
    db()
      .from("minecraft_identities")
      .select("user_id, nickname")
      .in("user_id", ids)
      .in("binding_status", ["reserved", "confirmed"]),
  ]);
  const nickOf = new Map(
    (nicks ?? []).map((n) => [n.user_id, n.nickname as string]),
  );
  for (const u of users ?? [])
    map.set(
      u.id as string,
      nickOf.get(u.id) ?? (u.display_name as string | null) ?? "Игрок",
    );
  return map;
}

async function toItems(rows: Row[]): Promise<GalleryItem[]> {
  const live = rows.filter(
    (r): r is Row & { media: NonNullable<Row["media"]> } => !!r.media,
  );
  const owners = await ownerNames([
    ...new Set(live.map((r) => r.media.uploader_id)),
  ]);
  return live.map((r) => ({
    id: r.media.id,
    width: r.media.width,
    height: r.media.height,
    visibility: r.media.visibility,
    createdAt: r.created_at,
    caption: r.caption,
    category: isCategory(r.category) ? r.category : "other",
    hidden: r.media.moderation_status === "hidden",
    hiddenReason: r.media.moderation_reason,
    ownerId: r.media.uploader_id,
    owner: owners.get(r.media.uploader_id) ?? "Игрок",
  }));
}

/** Public gallery (guests may see it): public, approved and not deleted, filtered in the query. */
export async function listPublicGallery(
  f: GalleryFilter = {},
  limit = GALLERY_PAGE,
) {
  let q = db()
    .from("media_attachments")
    .select(SELECT)
    .eq("target_type", "gallery")
    .eq("media.visibility", "public")
    .eq("media.moderation_status", "approved")
    .is("media.deleted_at", null);
  if (f.category && isCategory(f.category)) q = q.eq("category", f.category);
  if (f.author) {
    const uid = await userIdByNick(f.author.trim());
    if (!uid) return { items: [] as GalleryItem[], hasMore: false };
    q = q.eq("media.uploader_id", uid);
  }
  if (f.since === "week" || f.since === "month")
    q = q.gte(
      "created_at",
      new Date(
        Date.now() - (f.since === "week" ? 7 : 30) * 86_400_000,
      ).toISOString(),
    );
  const page = Math.max(0, f.page ?? 0);
  const from = page * limit;
  const { data, error } = await q
    .order("created_at", { ascending: f.sort === "old" })
    .range(from, from + limit); // one extra row tells whether there is a next page
  if (error) throw new Error(`gallery: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];
  return {
    items: await toItems(rows.slice(0, limit)),
    hasMore: rows.length > limit,
  };
}

/** The player's own images, hidden ones included. */
export async function listMyGallery(
  userId: string,
): Promise<(GalleryItem & { usedIn: number })[]> {
  const { data, error } = await db()
    .from("media_attachments")
    .select(SELECT)
    .eq("target_type", "gallery")
    .eq("target_id", userId)
    .is("media.deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`my gallery: ${error.message}`);
  const items = await toItems((data ?? []) as unknown as Row[]);
  const usage = await postUsage(items.map((i) => i.id));
  return items.map((i) => ({ ...i, usedIn: usage.get(i.id) ?? 0 }));
}

/** In how many posts each image is used. */
async function postUsage(ids: string[]) {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data } = await db()
    .from("media_attachments")
    .select("media_id")
    .eq("target_type", "post")
    .in("media_id", ids);
  for (const r of data ?? [])
    map.set(r.media_id as string, (map.get(r.media_id as string) ?? 0) + 1);
  return map;
}

/**
 * One entry for the viewer page. The owner and staff see it whatever its state (unless deleted);
 * everybody else only public, approved entries. Anything else is "not found", never a hint.
 */
export async function getGalleryItem(viewer: Viewer, id: string) {
  const { data, error } = await db()
    .from("media_attachments")
    .select(SELECT)
    .eq("target_type", "gallery")
    .eq("media_id", id)
    .is("media.deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const [item] = await toItems([data as unknown as Row]);
  if (!item) return null;
  const owner = viewer.userId === item.ownerId;
  const publicNow = item.visibility === "public" && !item.hidden;
  if (!owner && !viewer.canModerate && !publicNow) return null;
  let prev: string | null = null;
  let next: string | null = null;
  if (publicNow) {
    const base = () =>
      db()
        .from("media_attachments")
        .select("media_id, media:media_id!inner(id)")
        .eq("target_type", "gallery")
        .eq("media.visibility", "public")
        .eq("media.moderation_status", "approved")
        .is("media.deleted_at", null)
        .limit(1);
    const [newer, older] = await Promise.all([
      base()
        .gt("created_at", item.createdAt)
        .order("created_at", { ascending: true }),
      base()
        .lt("created_at", item.createdAt)
        .order("created_at", { ascending: false }),
    ]);
    prev = (newer.data?.[0]?.media_id as string | undefined) ?? null;
    next = (older.data?.[0]?.media_id as string | undefined) ?? null;
  }
  const usage =
    owner || viewer.canModerate ? ((await postUsage([id])).get(id) ?? 0) : 0;
  return { item, prev, next, usedIn: usage, isOwner: owner };
}

export async function addToGallery(
  viewer: Viewer,
  incomingPaths: string[],
  opts: {
    captions: string[];
    category: string;
    visibility: "public" | "private";
  },
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("post_forbidden");
  if (incomingPaths.length === 0) throw new SocialError("upload_missing");
  const category = isCategory(opts.category) ? opts.category : "other";
  const base = Date.now();
  const rows = await ingestUploads(
    viewer.userId,
    incomingPaths,
    opts.visibility,
  );
  if (rows.length > 0) {
    const { error } = await db()
      .from("media_attachments")
      .insert(
        rows.map((m, i) => ({
          media_id: m.id,
          target_type: "gallery",
          target_id: viewer.userId,
          caption: (opts.captions[i] ?? "").trim().slice(0, 200),
          category,
          // one statement gets one timestamp: stagger them so "newer / older" has a strict order
          created_at: new Date(base + i).toISOString(),
        })),
      );
    if (error) {
      await discardUnpublishedMedia(rows);
      throw new Error(`gallery attach: ${error.message}`);
    }
  }
  return rows.length;
}

async function ownedInGallery(viewer: Viewer, mediaId: string) {
  if (!viewer.userId) throw new SocialError("media_not_found");
  const { data } = await db()
    .from("media")
    .select("id")
    .eq("id", mediaId)
    .eq("uploader_id", viewer.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new SocialError("media_not_found"); // someone else's id looks the same as a missing one
}

/** Caption, category and visibility of one's own image; closing visibility works at once. */
export async function updateGalleryItem(
  viewer: Viewer,
  mediaId: string,
  patch: { caption?: string; category?: string; visibility?: string },
) {
  await ownedInGallery(viewer, mediaId);
  const att: Record<string, string> = {};
  if (patch.caption !== undefined)
    att.caption = patch.caption.trim().slice(0, 200);
  if (patch.category !== undefined && isCategory(patch.category))
    att.category = patch.category;
  if (Object.keys(att).length > 0)
    await db()
      .from("media_attachments")
      .update(att)
      .eq("media_id", mediaId)
      .eq("target_type", "gallery");
  if (patch.visibility === "public" || patch.visibility === "private")
    await db()
      .from("media")
      .update({ visibility: patch.visibility })
      .eq("id", mediaId);
}

/**
 * Deletes the image everywhere: every attachment is removed (posts keep their text) and the file is
 * scheduled for purge after 30 days (OD-40). The owner was warned how many posts use it.
 */
export async function deleteGalleryItem(viewer: Viewer, mediaId: string) {
  await ownedInGallery(viewer, mediaId);
  await removeEverywhere(mediaId);
  await writeAudit(viewer.userId!, "media.deleted", { media_id: mediaId });
}

async function removeEverywhere(mediaId: string) {
  const { error } = await db().rpc("media_soft_delete_everywhere", {
    p_id: mediaId,
  });
  if (error) throw new Error(`media deletion: ${error.message}`);
}

export async function reportMedia(
  viewer: Viewer,
  mediaId: string,
  reason: string,
) {
  if (!viewer.userId || viewer.cls === "guest")
    throw new SocialError("post_forbidden");
  const text = reason.trim();
  if (text.length < 3) throw new SocialError("reason_too_short");
  const found = await getGalleryItem(viewer, mediaId);
  if (!found || found.item.hidden) throw new SocialError("media_not_found");
  if (found.isOwner) throw new SocialError("report_own");
  const { error } = await db()
    .from("moderation_reports")
    .insert({
      reporter_id: viewer.userId,
      target_type: "media",
      target_id: mediaId,
      reason: text.slice(0, 500),
    });
  if (error?.code === "23505") throw new SocialError("report_duplicate");
  if (error) throw new Error(`report insert: ${error.message}`);
}

/** Moderator actions on any image; a reason is required for hiding and deleting. */
export async function moderateMedia(
  viewer: Viewer,
  mediaId: string,
  action: "hide" | "unhide" | "delete",
  reason: string,
) {
  if (!viewer.userId || !viewer.canModerate) throw new SocialError("forbidden");
  const note = reason.trim();
  if (action !== "unhide" && note.length < 3)
    throw new SocialError("reason_too_short");
  const { data: m } = await db()
    .from("media")
    .select("id")
    .eq("id", mediaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!m) throw new SocialError("media_not_found");
  if (action === "delete") {
    await removeEverywhere(mediaId);
  } else {
    await db()
      .from("media")
      .update(
        action === "hide"
          ? {
              moderation_status: "hidden",
              moderation_reason: note.slice(0, 300),
            }
          : { moderation_status: "approved", moderation_reason: null },
      )
      .eq("id", mediaId);
  }
  await writeAudit(
    viewer.userId,
    action === "hide"
      ? "media.hidden_by_moderator"
      : action === "unhide"
        ? "media.approved"
        : "media.deleted_by_moderator",
    { media_id: mediaId, reason: note || null },
  );
}

export { storageUsage };
