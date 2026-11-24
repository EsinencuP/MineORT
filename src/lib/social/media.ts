import "server-only";
import { randomUUID } from "node:crypto";
import { isCoverOfOpenProject } from "@/lib/projects/store";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import { normalizeImage } from "./image";
import { canSeePost, type Viewer } from "./viewer";

const BUCKET = "media";
export const MAX_IMAGES_PER_POST = 10;
const DAY_BYTES = 50 * 1024 * 1024;
const TOTAL_BYTES = 500 * 1024 * 1024;
export const PURGE_DAYS = 30;

const storage = () => db().storage.from(BUCKET);

export type MediaRow = {
  id: string;
  uploader_id: string;
  storage_key: string;
  visibility: string;
  moderation_status: string;
  deleted_at: string | null;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
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

/** Address the browser uploads to: a one-shot signed URL into the private incoming area. */
export async function createUploadTarget(userId: string) {
  if (!(await withinLimit(`upload:${userId}`, 3600, 20)))
    throw new SocialError("upload_rate_limited");
  // Files that were never attached to a post count too: at most 20 may be waiting at once.
  const { data: waiting } = await storage().list(`incoming/${userId}`, {
    limit: 50,
  });
  if ((waiting?.length ?? 0) >= 20)
    throw new SocialError("upload_rate_limited");
  const path = `incoming/${userId}/${randomUUID()}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data)
    throw new Error(`createSignedUploadUrl: ${error?.message}`);
  return { path, token: data.token };
}

async function usedBytes(userId: string) {
  const { data, error } = await db()
    .from("media")
    .select("bytes, created_at")
    .eq("uploader_id", userId);
  if (error) throw new Error(`media usage: ${error.message}`);
  const since = Date.now() - 86_400_000;
  let total = 0;
  let day = 0;
  for (const r of data ?? []) {
    total += r.bytes as number;
    if (Date.parse(r.created_at as string) >= since) day += r.bytes as number;
  }
  return { total, day };
}

/** What the player has stored: total and in the last 24 hours, with the limits. */
export async function storageUsage(userId: string) {
  const u = await usedBytes(userId);
  return { ...u, totalLimit: TOTAL_BYTES, dayLimit: DAY_BYTES };
}

/**
 * Turns files the browser put into the incoming area into checked WebP images owned by the user.
 * All-or-nothing: on any failure the images created so far are removed again.
 */
export async function ingestUploads(
  userId: string,
  incomingPaths: string[],
  visibility: "public" | "private",
): Promise<MediaRow[]> {
  const created: MediaRow[] = [];
  const prefix = `incoming/${userId}/`;
  try {
    const usage = await usedBytes(userId);
    let day = usage.day;
    let total = usage.total;
    for (const path of incomingPaths) {
      if (!path.startsWith(prefix) || path.includes(".."))
        throw new SocialError("upload_missing");
      const { data: blob, error } = await storage().download(path);
      if (error || !blob) throw new SocialError("upload_missing");
      const { data, width, height } = await normalizeImage(
        Buffer.from(await blob.arrayBuffer()),
      );
      day += data.length;
      total += data.length;
      if (day > DAY_BYTES) throw new SocialError("upload_quota_day");
      if (total > TOTAL_BYTES) throw new SocialError("upload_quota_total");

      const key = `${userId}/${randomUUID()}.webp`;
      const { data: row, error: insErr } = await db()
        .from("media")
        .insert({
          uploader_id: userId,
          storage_key: key,
          bytes: data.length,
          width,
          height,
          visibility,
        })
        .select(
          "id, uploader_id, storage_key, visibility, moderation_status, deleted_at, width, height, bytes, created_at",
        )
        .single();
      if (insErr || !row) {
        throw new Error(`media insert: ${insErr?.message}`);
      }
      created.push(row as MediaRow);
      const upload = await storage().upload(key, data, {
        contentType: "image/webp",
        upsert: false,
      });
      if (upload.error)
        throw new Error(`storage upload: ${upload.error.message}`);
    }
    return created;
  } catch (e) {
    await discardUnpublishedMedia(created);
    throw e;
  } finally {
    await storage()
      .remove(incomingPaths.filter((p) => p.startsWith(prefix)))
      .catch(() => undefined);
  }
}

export async function discardUnpublishedMedia(
  rows: { id: string; storage_key: string }[],
) {
  if (!rows.length) return;
  try {
    await discardMedia(rows);
  } catch (error) {
    const now = new Date().toISOString();
    const scheduled = await db()
      .from("media")
      .update({ deleted_at: now, purge_after: now })
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (scheduled.error)
      throw new Error(`media rollback scheduling: ${scheduled.error.message}`, {
        cause: error,
      });
    console.error("Deferred media rollback to purge", error);
  }
}

/** Hard removal of media that never became visible (rollback). */
export async function discardMedia(
  rows: { id: string; storage_key: string }[],
) {
  if (rows.length === 0) return 0;
  const keys = rows.map((r) => r.storage_key);
  const bucket = storage();
  const { error: removeError } = await bucket.remove(keys);
  if (removeError)
    throw new Error(`media storage removal: ${removeError.message}`);
  // A retry can find the file already gone. Check existence before dropping its database record.
  for (const key of keys) {
    const { data: exists } = await bucket.exists(key);
    if (exists)
      throw new Error(`media storage removal could not be confirmed: ${key}`);
  }
  const { error } = await db()
    .from("media")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  if (error) throw new Error(`media row removal: ${error.message}`);
  return rows.length;
}

/**
 * Soft-deletes the media that no live object uses any more; files are physically removed
 * after 30 days (OD-40, AC-24). A file still attached elsewhere is kept (TC-SOC-04d).
 */
export async function releaseUnusedMedia(mediaIds: string[]) {
  if (mediaIds.length === 0) return;
  const { error } = await db().rpc("media_release_unused", { p_ids: mediaIds });
  if (error) throw new Error(`media release: ${error.message}`);
}

/** Removes uploads that never became part of a post (older than one hour). */
export async function purgeStaleIncoming() {
  const cutoff = Date.now() - 3_600_000;
  let removed = 0;
  const { data: users } = await storage().list("incoming", { limit: 1000 });
  for (const u of users ?? []) {
    const { data: files } = await storage().list(`incoming/${u.name}`, {
      limit: 1000,
    });
    const stale = (files ?? []).filter(
      (f) => f.created_at && Date.parse(f.created_at) < cutoff,
    );
    if (stale.length === 0) continue;
    await storage().remove(stale.map((f) => `incoming/${u.name}/${f.name}`));
    removed += stale.length;
  }
  return removed;
}

/** Physical cleanup of media whose retention has ended (called by the daily job). */
export async function purgeExpiredMedia(limit = 200) {
  const { data, error } = await db()
    .from("media")
    .select("id, storage_key")
    .not("deleted_at", "is", null)
    .lte("purge_after", new Date().toISOString())
    .order("purge_after")
    .limit(limit);
  if (error) throw new Error(`media purge selection: ${error.message}`);
  return discardMedia(data ?? []);
}

/** Public gallery and project covers can be served before resolving a session. */
async function canReadAttachment(
  id: string,
  m: { visibility: string; moderation_status: string },
  viewer: () => Promise<Viewer>,
): Promise<boolean> {
  if (m.visibility !== "public" || m.moderation_status !== "approved")
    return false;
  const { data: atts } = await db()
    .from("media_attachments")
    .select("target_type, target_id")
    .eq("media_id", id);
  const list = atts ?? [];
  if (list.some((a) => a.target_type === "gallery")) return true;
  if (await isCoverOfOpenProject(id)) return true;
  const postIds = list
    .filter((a) => a.target_type === "post")
    .map((a) => a.target_id as string);
  if (postIds.length === 0) return false;
  const { data: posts, error } = await db()
    .from("posts")
    .select("kind, visibility, author_id")
    .in("id", postIds)
    .eq("moderation_status", "approved")
    .is("deleted_at", null);
  if (error) throw new Error(`media post audience: ${error.message}`);
  if (
    posts.some((post) => post.kind === "news" && post.visibility === "public")
  )
    return true;
  if (posts.length === 0) return false;
  const who = await viewer();
  return posts.some((post) => canSeePost(who, post));
}

/** Stream through MineOrt so reopening the URL always checks the current audience. */
export async function readMedia(
  id: string,
  getViewer: () => Promise<Viewer>,
  thumbnail = false,
): Promise<Blob | null> {
  const { data: m, error } = await db()
    .from("media")
    .select(
      "id, uploader_id, storage_key, visibility, moderation_status, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`media lookup: ${error.message}`);
  if (!m || m.deleted_at) return null;
  let viewer: Promise<Viewer> | undefined;
  const resolveViewer = () => (viewer ??= getViewer());
  if (!(await canReadAttachment(id, m, resolveViewer))) {
    const who = await resolveViewer();
    if (
      !who.canModerate &&
      (who.userId !== m.uploader_id || who.cls === "restricted")
    )
      return null;
  }
  const { data } = await storage().download(
    m.storage_key,
    thumbnail
      ? { transform: { width: 480, resize: "contain", quality: 75 } }
      : undefined,
  );
  if (data || !thumbnail) return data;
  // Local Storage and some hosted plans have no image transformation service.
  const original = await storage().download(m.storage_key);
  if (!original.data) return null;
  const { default: sharp } = await import("sharp");
  const image = await sharp(Buffer.from(await original.data.arrayBuffer()))
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  return new Blob([new Uint8Array(image)], { type: "image/webp" });
}
