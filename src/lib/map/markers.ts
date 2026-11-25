import "server-only";
import { writeAudit } from "@/lib/audit";
import { withinRateLimit } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/current-user";
import { authorsOf } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";
import {
  canDelete,
  canEdit,
  canSee,
  GUEST_VIEWER,
  statusFor,
  type Dim,
  type MarkerInput,
  type MarkerRow,
  type MarkerViewer,
} from "./marker-rules";
import { loadViewer } from "./viewer";
import type { Vertex } from "./polygon";
import { awardProgress } from "@/lib/community/progress";
import { isEnabled } from "@/lib/flags";
import { loadOwnRecentPath } from "./trails";
import { validRoutePoints } from "./route-geometry";
import type { TrailPoint } from "./trail-geometry";

/** Stable error codes of the map markers; user texts live in access/messages.ts. */
export class MarkerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export const MARKERS_PER_HOUR = 10;
export const MAX_ACTIVE_MARKERS = 100;
// The service reads either schema during deployment. toDtos controls what leaves the server.
const COLUMNS = "*";

/** What the map gets of a marker. Heights go to staff only; the map itself shows no numbers. */
export type MarkerDto = {
  boundary?: Vertex[] | null;
  geometry?: TrailPoint[][];
  bookmarked?: boolean;
  id: string;
  kind: MarkerRow["kind"];
  dim: Dim;
  x: number;
  z: number;
  y?: number | null;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  visibility: MarkerRow["visibility"];
  status: MarkerRow["moderation_status"];
  author: string;
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
};

/** The person looking at the map, as far as markers are concerned. */
export async function getMarkerViewer(): Promise<MarkerViewer> {
  const user = await getCurrentUser();
  if (!user) return GUEST_VIEWER;
  const [v, social] = await Promise.all([loadViewer(user), getViewer()]);
  return {
    userId: user.userId,
    member: v.member && social.cls !== "restricted",
    staff: v.showCoordinates,
    moderator: social.canModerate,
    guildId: v.member ? v.guildId : null,
  };
}

async function toDtos(
  v: MarkerViewer,
  rows: MarkerRow[],
): Promise<MarkerDto[]> {
  const bookmarkEnabled = Boolean(
    v.userId && (v.member || v.moderator) && isEnabled("ff_social_comments"),
  );
  const [authors, bookmarks] = await Promise.all([
    authorsOf([...new Set(rows.map((r) => r.author_id))]),
    bookmarkEnabled
      ? db()
          .from("community_bookmarks")
          .select("target_id")
          .eq("user_id", v.userId)
          .eq("target_type", "marker")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bookmarks.error && bookmarks.error.code !== "PGRST205")
    console.error("marker bookmarks:", bookmarks.error.message);
  const saved = bookmarks.data
    ? new Set(bookmarks.data.map((row) => row.target_id))
    : null;
  return rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    dim: m.dim,
    x: m.x,
    z: m.z,
    ...(m.boundary ? { boundary: m.boundary } : {}),
    ...(m.geometry ? { geometry: m.geometry } : {}),
    ...(bookmarkEnabled && saved ? { bookmarked: saved.has(m.id) } : {}),
    ...(v.staff ? { y: m.y } : {}),
    name: m.name,
    description: m.description,
    icon: m.icon,
    color: m.color,
    visibility: m.visibility,
    status: m.moderation_status,
    author:
      m.kind === "label"
        ? "Администрация"
        : (authors.get(m.author_id)?.name ?? "Игрок"),
    mine: v.userId === m.author_id,
    canEdit: canEdit(v, m),
    canDelete: canDelete(v, m),
    createdAt: m.created_at,
  }));
}

async function loadRow(id: string): Promise<MarkerRow | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const { data, error } = await db()
    .from("map_markers")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`map_markers read: ${error.message}`);
  return data as MarkerRow | null;
}

export async function getVisibleMarkerRow(v: MarkerViewer, id: string) {
  const row = await loadRow(id);
  return row && canSee(v, row) ? row : null;
}

/** Every marker of a dimension this viewer may see (R13): the rest never leaves the server. */
export async function listMarkers(v: MarkerViewer, dim: Dim) {
  const { data, error } = await db()
    .from("map_markers")
    .select(COLUMNS)
    .eq("dim", dim)
    .is("deleted_at", null)
    .order("created_at")
    .limit(5000);
  if (error) throw new Error(`map_markers list: ${error.message}`);
  return toDtos(
    v,
    (data as MarkerRow[]).filter((m) => canSee(v, m)),
  );
}

/** One marker for a direct link; null when it does not exist or is not this viewer's to see. */
export async function getMarker(v: MarkerViewer, id: string) {
  const row = await getVisibleMarkerRow(v, id);
  if (!row) return null;
  return (await toDtos(v, [row]))[0];
}

export async function getMarkersForCollection(v: MarkerViewer, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await db()
    .from("map_markers")
    .select(COLUMNS)
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new Error(`collection markers: ${error.message}`);
  const visible = new Map(
    (data as MarkerRow[])
      .filter((row) => canSee(v, row))
      .map((row) => [row.id, row]),
  );
  return toDtos(
    v,
    ids.flatMap((id) => {
      const row = visible.get(id);
      return row ? [row] : [];
    }),
  );
}

function guildFor(v: MarkerViewer, input: MarkerInput) {
  if (input.visibility !== "guild") return null;
  if (!v.guildId) throw new MarkerError("marker_no_guild");
  return v.guildId;
}

export async function createMarker(v: MarkerViewer, input: MarkerInput) {
  if (!v.userId || !(v.member || v.staff))
    throw new MarkerError("marker_forbidden");
  if (input.kind === "label" && !v.staff)
    throw new MarkerError("label_forbidden");
  const guildId = input.kind !== "label" ? guildFor(v, input) : null;
  const { count, error: countError } = await db()
    .from("map_markers")
    .select("id", { count: "exact", head: true })
    .eq("author_id", v.userId)
    .is("deleted_at", null);
  if (countError) throw new Error(`map_markers count: ${countError.message}`);
  if ((count ?? 0) >= MAX_ACTIVE_MARKERS && !v.staff)
    throw new MarkerError("marker_limit");
  if (
    !v.staff &&
    !(await withinRateLimit(`map:marker:${v.userId}`, 3600, MARKERS_PER_HOUR))
  )
    throw new MarkerError("marker_rate_limited");

  let geometry: TrailPoint[][] | undefined;
  if (input.kind === "path") {
    geometry = await loadOwnRecentPath(v.userId, input.dim);
    if (!geometry.length) throw new MarkerError("marker_path_empty");
  } else if (input.kind === "route") {
    if (!validRoutePoints(input.routePoints))
      throw new MarkerError("marker_route_invalid");
    geometry = [input.routePoints];
  }
  const anchor = geometry?.[0]?.[0];

  const { data, error } = await db()
    .from("map_markers")
    .insert({
      author_id: v.userId,
      kind: input.kind,
      dim: input.dim,
      x: anchor ? Math.floor(anchor[0]) : input.x,
      y: anchor ? null : input.y,
      z: anchor ? Math.floor(anchor[1]) : input.z,
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
      ...(input.boundary ? { boundary: input.boundary } : {}),
      ...(geometry ? { geometry } : {}),
      visibility: input.kind === "label" ? "public" : input.visibility,
      guild_id: guildId,
      moderation_status:
        input.kind === "label" ? "approved" : statusFor(v, input.visibility),
    })
    .select(COLUMNS)
    .single();
  if (error?.code === "PGRST204" && input.boundary)
    throw new MarkerError("marker_boundary_unavailable");
  if (error) throw new Error(`map_markers insert: ${error.message}`);
  return (await toDtos(v, [data as MarkerRow]))[0];
}

/**
 * Changes a marker. A player's public marker goes back to the moderators after any change, so an
 * approved marker cannot be turned into something else unseen.
 */
export async function updateMarker(
  v: MarkerViewer,
  id: string,
  input: MarkerInput,
) {
  const row = await loadRow(id);
  if (!row || !canSee(v, row)) throw new MarkerError("marker_not_found");
  if (!canEdit(v, row)) throw new MarkerError("forbidden");
  const label = row.kind === "label";
  if (!label && input.boundary)
    throw new MarkerError("marker_boundary_invalid");
  const visibility = label ? row.visibility : input.visibility;
  const status =
    row.moderation_status === "hidden" && !v.moderator
      ? "hidden"
      : label
        ? "approved"
        : statusFor(v, visibility);
  const { data, error } = await db()
    .from("map_markers")
    .update({
      // a marker stays where it was put and in its dimension; only its card changes
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
      ...(input.boundary !== undefined && (row.boundary || input.boundary)
        ? { boundary: input.boundary }
        : {}),
      visibility,
      guild_id: label ? row.guild_id : guildFor(v, { ...input, visibility }),
      moderation_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error?.code === "PGRST204" && input.boundary)
    throw new MarkerError("marker_boundary_unavailable");
  if (error) throw new Error(`map_markers update: ${error.message}`);
  return (await toDtos(v, [data as MarkerRow]))[0];
}

export async function deleteMarker(v: MarkerViewer, id: string) {
  const row = await loadRow(id);
  if (!row || !canSee(v, row)) throw new MarkerError("marker_not_found");
  if (!canDelete(v, row)) throw new MarkerError("forbidden");
  const { error } = await db()
    .from("map_markers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`map_markers delete: ${error.message}`);
  if (v.userId !== row.author_id)
    await writeAudit(v.userId!, "marker.deleted", { marker_id: id });
}

export async function reportMarker(
  v: MarkerViewer,
  id: string,
  reason: string,
) {
  if (!v.userId) throw new MarkerError("forbidden");
  const text = reason.trim();
  if (text.length < 3) throw new MarkerError("reason_too_short");
  const row = await loadRow(id);
  if (!row || !canSee(v, row) || row.moderation_status !== "approved")
    throw new MarkerError("marker_not_found");
  if (row.author_id === v.userId) throw new MarkerError("report_own_marker");
  const { error } = await db()
    .from("moderation_reports")
    .insert({
      reporter_id: v.userId,
      target_type: "marker",
      target_id: id,
      reason: text.slice(0, 500),
    });
  if (error?.code === "23505") throw new MarkerError("report_marker_duplicate");
  if (error) throw new Error(`report insert: ${error.message}`);
}

/* ---------------- moderation ---------------- */

/** Public markers waiting for a moderator, oldest first. */
export async function listPendingMarkers() {
  const { data, error } = await db()
    .from("map_markers")
    .select(COLUMNS)
    .eq("moderation_status", "pending")
    .is("deleted_at", null)
    .order("created_at")
    .limit(200);
  if (error) throw new Error(`pending markers: ${error.message}`);
  const rows = data as MarkerRow[];
  const authors = await authorsOf([...new Set(rows.map((r) => r.author_id))]);
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    icon: m.icon,
    dim: m.dim,
    author: authors.get(m.author_id)?.name ?? "Игрок",
    createdAt: m.created_at,
  }));
}

/** A moderator approves a public marker, or hides it (from everyone but its author and staff). */
export async function decideMarker(
  moderatorId: string,
  id: string,
  decision: "approve" | "hide",
  note: string,
) {
  const reason = note.trim();
  if (decision === "hide" && reason.length < 3)
    throw new MarkerError("reason_too_short");
  const { data, error } = await db()
    .from("map_markers")
    .update({
      moderation_status: decision === "approve" ? "approved" : "hidden",
      moderation_reason: decision === "hide" ? reason : null,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, author_id, visibility");
  if (error) throw new Error(`decide marker: ${error.message}`);
  if (!data?.length) throw new MarkerError("marker_not_found");
  if (decision === "approve" && data[0].visibility === "public")
    await awardProgress(data[0].author_id, "marker");
  await writeAudit(moderatorId, `marker.${decision}`, {
    marker_id: id,
    note: reason || null,
  });
}
