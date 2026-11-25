import "server-only";
import { db } from "@/lib/supabase-admin";
import {
  createUploadTarget,
  discardUnpublishedMedia,
  downloadMediaFile,
  ingestUploads,
} from "@/lib/social/media";
import { MAX_MARKER_SCREENSHOTS } from "./marker-media-rules";
import { canEdit, type MarkerViewer } from "./marker-rules";
import { getVisibleMarkerRow, MarkerError } from "./markers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireVisible(v: MarkerViewer, id: string) {
  const marker = await getVisibleMarkerRow(v, id);
  if (!marker) throw new MarkerError("marker_not_found");
  return marker;
}

async function requireEditor(v: MarkerViewer, id: string) {
  const marker = await requireVisible(v, id);
  if (!v.userId || !(v.member || v.staff) || !canEdit(v, marker))
    throw new MarkerError("marker_forbidden");
  return v.userId;
}

function markerAttachments(id: string) {
  return db()
    .from("media_attachments")
    .select("media_id, media!inner(id)")
    .eq("target_type", "marker")
    .eq("target_id", id)
    .eq("media.moderation_status", "approved")
    .is("media.deleted_at", null)
    .order("position");
}

export async function listMarkerScreenshots(v: MarkerViewer, id: string) {
  await requireVisible(v, id);
  const { data, error } = await markerAttachments(id);
  if (error) throw new Error(`marker media list: ${error.message}`);
  return data.map((row) => row.media_id as string);
}

export async function startMarkerScreenshot(v: MarkerViewer, id: string) {
  const actor = await requireEditor(v, id);
  const { data, error } = await markerAttachments(id);
  if (error) throw new Error(`marker media check: ${error.message}`);
  if (data.length >= MAX_MARKER_SCREENSHOTS)
    throw new MarkerError("marker_media_limit");
  return createUploadTarget(actor);
}

export async function attachMarkerScreenshots(
  v: MarkerViewer,
  id: string,
  paths: string[],
) {
  const actor = await requireEditor(v, id);
  if (
    !paths.length ||
    paths.length > MAX_MARKER_SCREENSHOTS ||
    new Set(paths).size !== paths.length
  )
    throw new MarkerError("marker_media_limit");
  const prefix = `incoming/${actor}/`;
  if (
    paths.some(
      (path) =>
        !path.startsWith(prefix) || !UUID.test(path.slice(prefix.length)),
    )
  )
    throw new MarkerError("upload_missing");
  const { data, error: listError } = await markerAttachments(id);
  if (listError) throw new Error(`marker media check: ${listError.message}`);
  if (data.length + paths.length > MAX_MARKER_SCREENSHOTS)
    throw new MarkerError("marker_media_limit");

  const media = await ingestUploads(actor, paths, "private");
  const ids = media.map((item) => item.id);
  const { error } = await db().rpc("map_attach_marker_media", {
    p_marker: id,
    p_actor: actor,
    p_admin: v.staff,
    p_media: ids,
  });
  if (error) {
    // A network failure can happen after the database has committed.
    const { data: saved, error: stateError } = await markerAttachments(id);
    if (stateError)
      throw new Error(`marker media attachment state: ${stateError.message}`);
    const linked = saved.map((row) => row.media_id as string);
    if (ids.every((mediaId) => linked.includes(mediaId))) return linked;
    await discardUnpublishedMedia(media);
    if (
      [
        "marker_media_limit",
        "marker_not_found",
        "marker_forbidden",
        "upload_missing",
      ].includes(error.message)
    )
      throw new MarkerError(error.message);
    throw new Error(`marker media attachment: ${error.message}`);
  }
  return listMarkerScreenshots(v, id);
}

export async function readMarkerScreenshot(
  v: MarkerViewer,
  id: string,
  mediaId: string,
  thumbnail: boolean,
) {
  if (!UUID.test(mediaId)) return null;
  if (!(await getVisibleMarkerRow(v, id))) return null;
  const { data, error } = await db()
    .from("media")
    .select("storage_key, media_attachments!inner(target_type, target_id)")
    .eq("id", mediaId)
    .eq("moderation_status", "approved")
    .is("deleted_at", null)
    .eq("media_attachments.target_type", "marker")
    .eq("media_attachments.target_id", id)
    .maybeSingle();
  if (error) throw new Error(`marker media read: ${error.message}`);
  return data ? downloadMediaFile(data.storage_key as string, thumbnail) : null;
}
