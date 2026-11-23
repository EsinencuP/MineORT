// Who sees and changes a marker (R13, R18), and what a valid marker is. Pure, so it is tested alone.
import icons from "@/components/map/icons.json";

export type Visibility = "public" | "guild" | "private";
export type ModerationStatus = "pending" | "approved" | "hidden";
export type MarkerKind = "point" | "label";
export type Dim = "overworld" | "nether";

export type MarkerViewer = {
  userId: string | null;
  /** an approved member of the server: may put markers */
  member: boolean;
  /** an administrator with a confirmed TOTP: puts labels, sees heights and coordinates */
  staff: boolean;
  /** a moderator or administrator with a confirmed TOTP: sees and decides everything */
  moderator: boolean;
  guildId: string | null;
};

export const GUEST_VIEWER: MarkerViewer = {
  userId: null,
  member: false,
  staff: false,
  moderator: false,
  guildId: null,
};

export type MarkerRow = {
  id: string;
  author_id: string;
  kind: MarkerKind;
  dim: Dim;
  x: number;
  y: number | null;
  z: number;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  visibility: Visibility;
  guild_id: string | null;
  moderation_status: ModerationStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarkerInput = {
  kind: MarkerKind;
  dim: Dim;
  x: number;
  y: number | null;
  z: number;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  visibility: Visibility;
};

export const ICON_IDS = new Set(
  (icons as { icons: { id: string }[] }).icons.map((i) => i.id),
);

/** A marker reaches a viewer only if this says so: the list, a direct link and a report all ask it. */
export function canSee(v: MarkerViewer, m: MarkerRow): boolean {
  if (m.deleted_at) return false;
  if (v.moderator) return true;
  if (v.userId && v.userId === m.author_id) return true;
  if (m.moderation_status !== "approved") return false;
  if (m.visibility === "public") return true;
  if (m.visibility === "guild") return !!v.guildId && v.guildId === m.guild_id;
  return false;
}

/** The author edits their own marker; labels belong to the administrators. */
export function canEdit(v: MarkerViewer, m: MarkerRow): boolean {
  if (m.deleted_at || !v.userId) return false;
  if (m.kind === "label") return v.staff;
  return v.userId === m.author_id;
}

/** The author or a moderator removes a marker. */
export function canDelete(v: MarkerViewer, m: MarkerRow): boolean {
  return canEdit(v, m) || (v.moderator && !m.deleted_at);
}

/**
 * Public markers wait for a moderator (R18): the author sees them at once, the others after the
 * approval. Guild and private markers, and anything a moderator puts, need no approval.
 */
export function statusFor(
  v: MarkerViewer,
  visibility: Visibility,
): ModerationStatus {
  return visibility === "public" && !v.moderator ? "pending" : "approved";
}

const BORDER = 30_000_000;
const int = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) ? v : NaN;

/** Validates what a client sends; null when anything is off. */
export function parseMarkerInput(raw: unknown): MarkerInput | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const description =
    typeof r.description === "string" ? r.description.trim() : "";
  const x = int(r.x);
  const z = int(r.z);
  const y = r.y === null || r.y === undefined ? null : int(r.y);
  const kind =
    r.kind === "label"
      ? "label"
      : r.kind === undefined || r.kind === "point"
        ? "point"
        : null;
  const color =
    r.color === null || r.color === undefined || r.color === ""
      ? null
      : typeof r.color === "string" &&
          /^#[0-9a-f]{6}$/.test(r.color.toLowerCase())
        ? r.color.toLowerCase()
        : undefined;
  if (
    !kind ||
    name.length < 1 ||
    name.length > 60 ||
    description.length > 1000 ||
    typeof r.icon !== "string" ||
    !ICON_IDS.has(r.icon) ||
    color === undefined ||
    (r.dim !== "overworld" && r.dim !== "nether") ||
    (r.visibility !== "public" &&
      r.visibility !== "guild" &&
      r.visibility !== "private") ||
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > BORDER ||
    Math.abs(z) > BORDER ||
    (y !== null && (!Number.isFinite(y) || y < -64 || y > 320))
  )
    return null;
  return {
    kind,
    dim: r.dim,
    x,
    y,
    z,
    name,
    description,
    icon: r.icon,
    color,
    visibility: r.visibility,
  };
}
