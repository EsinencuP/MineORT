import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import { normalizeImage } from "./image";
import type { Viewer } from "./viewer";

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
      const up = await storage().upload(key, data, {
        contentType: "image/webp",
        upsert: false,
      });
      if (up.error) throw new Error(`storage upload: ${up.error.message}`);
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
        await storage().remove([key]);
        throw new Error(`media insert: ${insErr?.message}`);
      }
      created.push(row as MediaRow);
    }
    return created;
  } catch (e) {
    await discardMedia(created);
    throw e;
  } finally {
    await storage()
      .remove(incomingPaths.filter((p) => p.startsWith(prefix)))
      .catch(() => undefined);
  }
}

/** Hard removal of media that never became visible (rollback). */
export async function discardMedia(
  rows: { id: string; storage_key: string }[],
) {
  if (rows.length === 0) return;
  await storage()
    .remove(rows.map((r) => r.storage_key))
    .catch(() => undefined);
  await db()
    .from("media")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
}

/**
 * Soft-deletes the media that no live object uses any more; files are physically removed
 * after 30 days (OD-40, AC-24). A file still attached elsewhere is kept (TC-SOC-04d).
 */
export async function releaseUnusedMedia(mediaIds: string[]) {
  if (mediaIds.length === 0) return;
  const { data: still } = await db()
    .from("media_attachments")
    .select("media_id")
    .in("media_id", mediaIds);
  const used = new Set((still ?? []).map((r) => r.media_id as string));
  const free = mediaIds.filter((id) => !used.has(id));
  if (free.length === 0) return;
  const now = new Date();
  await db()
    .from("media")
    .update({
      deleted_at: now.toISOString(),
      purge_after: new Date(
        now.getTime() + PURGE_DAYS * 86_400_000,
      ).toISOString(),
    })
    .in("id", free)
    .is("deleted_at", null);
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
  const { data } = await db()
    .from("media")
    .select("id, storage_key")
    .not("deleted_at", "is", null)
    .lte("purge_after", new Date().toISOString())
    .limit(limit);
  const rows = (data ?? []) as { id: string; storage_key: string }[];
  await discardMedia(rows);
  return rows.length;
}

/**
 * May this viewer fetch the file? Owner and staff always (unless deleted); everybody else only
 * public, approved media that is in the public gallery or on a visible public post.
 */
export async function mediaSignedUrl(
  id: string,
  viewer: Viewer,
): Promise<string | null> {
  const { data: m } = await db()
    .from("media")
    .select(
      "id, uploader_id, storage_key, visibility, moderation_status, deleted_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!m || m.deleted_at) return null;
  const owner = viewer.userId === m.uploader_id;
  let allowed = owner || viewer.canModerate;
  if (
    !allowed &&
    m.visibility === "public" &&
    m.moderation_status === "approved"
  ) {
    const { data: atts } = await db()
      .from("media_attachments")
      .select("target_type, target_id")
      .eq("media_id", id);
    const list = atts ?? [];
    if (list.some((a) => a.target_type === "gallery")) allowed = true;
    else {
      const postIds = list
        .filter((a) => a.target_type === "post")
        .map((a) => a.target_id as string);
      if (postIds.length > 0) {
        const { count } = await db()
          .from("posts")
          .select("id", { count: "exact", head: true })
          .in("id", postIds)
          .eq("visibility", "public")
          .eq("moderation_status", "approved")
          .is("deleted_at", null);
        allowed = (count ?? 0) > 0;
      }
    }
  }
  if (!allowed) return null;
  const { data: signed } = await storage().createSignedUrl(m.storage_key, 120);
  return signed?.signedUrl ?? null;
}
