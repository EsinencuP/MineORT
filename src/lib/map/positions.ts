// Position batches from the Paper plugin, and their split into per-channel messages.
import { TOPIC_ADMIN, topicsFor, type MapVisibility } from "./visibility";

export const MAX_PLAYERS_PER_BATCH = 200;
const LIMIT = 30_000_000; // the world border of Minecraft

export type Dim = "overworld" | "nether";

export type Position = {
  uuid: string;
  dim: Dim;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIMS: Record<string, Dim> = {
  overworld: "overworld",
  nether: "nether",
};

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LIMIT;

/**
 * Valid positions of a batch. A malformed entry is skipped rather than failing the whole batch:
 * one odd player must not stop everyone else's dot. The End and other worlds are not drawn.
 * Throws when the batch itself is not a list or is larger than the limit.
 */
export function parsePositions(raw: unknown): Position[] {
  if (!Array.isArray(raw) || raw.length > MAX_PLAYERS_PER_BATCH)
    throw new Error("bad batch");
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) continue;
    const { uuid, dim, x, y, z, yaw } = p as Record<string, unknown>;
    if (typeof uuid !== "string" || !UUID.test(uuid)) continue;
    const d = typeof dim === "string" ? DIMS[dim] : undefined;
    if (!d || !finite(x) || !finite(y) || !finite(z)) continue;
    const id = uuid.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      uuid: id,
      dim: d,
      x: Math.round(x * 10) / 10,
      y: Math.round(y),
      z: Math.round(z * 10) / 10,
      yaw: finite(yaw) ? Math.round(((yaw % 360) + 360) % 360) : 0,
    });
  }
  return out;
}

export type Resolved = {
  nickname: string;
  visibility: MapVisibility;
  guildId: string | null;
};

/** What goes on the wire: short keys, one list per channel. */
export type WireDot = {
  n: string; // nickname
  d: Dim;
  x: number;
  y: number;
  z: number;
  r: number; // facing, degrees
};
type Wire = Omit<WireDot, "y"> & { y?: number };

/**
 * Groups the positions by channel. A player the site does not know (no confirmed identity) is
 * shown to staff only and carries the nickname "?".
 */
export function groupByTopic(
  positions: Position[],
  resolved: ReadonlyMap<string, Resolved>,
): Map<string, Wire[]> {
  const groups = new Map<string, Wire[]>();
  for (const p of positions) {
    const who = resolved.get(p.uuid);
    const flat: Wire = {
      n: who?.nickname ?? "?",
      d: p.dim,
      x: p.x,
      z: p.z,
      r: p.yaw,
    };
    const topics = who
      ? topicsFor({ visibility: who.visibility, guildId: who.guildId })
      : topicsFor({ visibility: "guild", guildId: null });
    for (const t of topics) {
      // the height is only for staff: the drawn map has no use for it
      const dot = t === TOPIC_ADMIN ? { ...flat, y: p.y } : flat;
      const list = groups.get(t);
      if (list) list.push(dot);
      else groups.set(t, [dot]);
    }
  }
  return groups;
}
