import "server-only";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import { ingestUploads, releaseUnusedMedia } from "./media";
import type { Viewer } from "./viewer";

export const GALLERY_PAGE = 24;

export type GalleryItem = {
  id: string;
  width: number;
  height: number;
  visibility: string;
  createdAt: string;
  owner?: string;
};

type Row = {
  media_id: string;
  media: {
    id: string;
    uploader_id: string;
    width: number;
    height: number;
    visibility: string;
    moderation_status: string;
    deleted_at: string | null;
    created_at: string;
  } | null;
};

const SELECT =
  "media_id, media:media_id (id, uploader_id, width, height, visibility, moderation_status, deleted_at, created_at)";

/** Public gallery (guests may see it): public, approved, not deleted. */
export async function listPublicGallery(page = 0) {
  const { data, error } = await db()
    .from("media_attachments")
    .select(SELECT)
    .eq("target_type", "gallery")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`gallery: ${error.message}`);
  const visible = ((data ?? []) as unknown as Row[])
    .map((r) => r.media)
    .filter(
      (m): m is NonNullable<Row["media"]> =>
        !!m &&
        !m.deleted_at &&
        m.visibility === "public" &&
        m.moderation_status === "approved",
    );
  const from = page * GALLERY_PAGE;
  const slice = visible.slice(from, from + GALLERY_PAGE);
  const owners = await ownerNames([
    ...new Set(slice.map((m) => m.uploader_id)),
  ]);
  return {
    items: slice.map<GalleryItem>((m) => ({
      id: m.id,
      width: m.width,
      height: m.height,
      visibility: m.visibility,
      createdAt: m.created_at,
      owner: owners.get(m.uploader_id),
    })),
    hasMore: visible.length > from + GALLERY_PAGE,
  };
}

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

/** The player's own images (public and hidden), newest first. */
export async function listMyGallery(userId: string): Promise<GalleryItem[]> {
  const { data, error } = await db()
    .from("media_attachments")
    .select(SELECT)
    .eq("target_type", "gallery")
    .eq("target_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`my gallery: ${error.message}`);
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.media)
    .filter((m): m is NonNullable<Row["media"]> => !!m && !m.deleted_at)
    .map((m) => ({
      id: m.id,
      width: m.width,
      height: m.height,
      visibility: m.visibility,
      createdAt: m.created_at,
    }));
}

export async function addToGallery(
  viewer: Viewer,
  incomingPaths: string[],
  visibility: "public" | "private",
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("post_forbidden");
  const rows = await ingestUploads(viewer.userId, incomingPaths, visibility);
  if (rows.length > 0) {
    const { error } = await db()
      .from("media_attachments")
      .insert(
        rows.map((m) => ({
          media_id: m.id,
          target_type: "gallery",
          target_id: viewer.userId,
        })),
      );
    if (error) throw new Error(`gallery attach: ${error.message}`);
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

/** Hide from / show in the public gallery. */
export async function setGalleryVisibility(
  viewer: Viewer,
  mediaId: string,
  visibility: "public" | "private",
) {
  await ownedInGallery(viewer, mediaId);
  await db().from("media").update({ visibility }).eq("id", mediaId);
}

/** Removes the image from the gallery; the file goes only if no post uses it any more. */
export async function removeFromGallery(viewer: Viewer, mediaId: string) {
  await ownedInGallery(viewer, mediaId);
  await db()
    .from("media_attachments")
    .delete()
    .eq("media_id", mediaId)
    .eq("target_type", "gallery");
  await releaseUnusedMedia([mediaId]);
}
