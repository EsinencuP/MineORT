import "server-only";
import { db } from "@/lib/supabase-admin";
import type { RegionBounds } from "./region-bounds";
import { rebuildRegion, type Dim } from "./regions";

/** The ingest pipeline gets this long to rebuild a changed region before a viewer's request does. */
const REBUILD_AFTER_MS = 20_000;

export type Tile = { png: Buffer; version: number };

/** The game server whose map changed most recently; the site has one world. */
export async function mapServerId(): Promise<string | null> {
  const { data, error } = await db()
    .from("map_regions")
    .select("server_id")
    .order("dirty_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`map server lookup: ${error.message}`);
  return (data?.server_id as string | undefined) ?? null;
}

type Row = {
  out_tile: string | null;
  out_version: number;
  out_dirty: boolean;
  out_dirty_at: string;
  out_has_tile: boolean;
};

// one rebuild per region at a time on this instance, however many viewers ask
const building = new Map<string, Promise<boolean>>();
function rebuildOnce(serverId: string, dim: Dim, rx: number, rz: number) {
  const key = `${serverId}:${dim}:${rx}:${rz}`;
  let run = building.get(key);
  if (!run) {
    run = rebuildRegion({ serverId, dim, rx, rz }).finally(() =>
      building.delete(key),
    );
    building.set(key, run);
  }
  return run;
}

async function readRow(serverId: string, dim: Dim, rx: number, rz: number) {
  const { data, error } = await db().rpc("map_read_tile", {
    p_server_id: serverId,
    p_dim: dim,
    p_rx: rx,
    p_rz: rz,
  });
  if (error) throw new Error(`map_read_tile: ${error.message}`);
  return ((data as Row[])[0] ?? null) as Row | null;
}

/**
 * The picture of one region. A region with no tile yet is built now; a changed region is served as
 * it was until the ingest pipeline has had time to rebuild it. A region nobody has explored is null.
 */
export async function loadTile(
  serverId: string,
  dim: Dim,
  rx: number,
  rz: number,
  expectedVersion?: number,
): Promise<Tile | null> {
  let row = await readRow(serverId, dim, rx, rz);
  if (!row) return null;
  // A built region that changed a moment ago is served as it is. Rebuilding is for a region that
  // has no tile yet, or that the ingest pipeline has left dirty for too long.
  const overdue =
    row.out_dirty &&
    Date.now() - Date.parse(row.out_dirty_at) > REBUILD_AFTER_MS;
  const staleForViewer =
    row.out_dirty && expectedVersion === Number(row.out_version) + 1;
  if (!row.out_has_tile || overdue || staleForViewer) {
    await rebuildOnce(serverId, dim, rx, rz);
    row = await readRow(serverId, dim, rx, rz);
  }
  if (!row?.out_tile) return null;
  return {
    png: Buffer.from(row.out_tile, "base64"),
    version: Number(row.out_version),
  };
}

/** Explored regions intersecting the viewport. Each page fits the Data API row limit. */
export async function listRegions(
  serverId: string,
  dim: Dim,
  bounds: RegionBounds,
): Promise<{ rx: number; rz: number; version: number }[]> {
  const result: { rx: number; rz: number; version: number }[] = [];
  const pageSize = 500;
  let last: { rx: number; rz: number } | undefined;
  for (;;) {
    let query = db()
      .from("map_regions")
      .select("rx, rz, built_version, dirty")
      .eq("server_id", serverId)
      .eq("dim", dim)
      .gte("rx", bounds.minX)
      .lte("rx", bounds.maxX)
      .gte("rz", bounds.minZ)
      .lte("rz", bounds.maxZ)
      .order("rx")
      .order("rz")
      .limit(pageSize);
    if (last)
      query = query.or(
        `rx.gt.${last.rx},and(rx.eq.${last.rx},rz.gt.${last.rz})`,
      );
    const { data, error } = await query;
    if (error) throw new Error(`map_regions list: ${error.message}`);
    result.push(
      ...data.map((row) => ({
        rx: row.rx,
        rz: row.rz,
        version: Number(row.built_version) + (row.dirty ? 1 : 0),
      })),
    );
    if (data.length < pageSize) return result;
    last = data.at(-1);
  }
}

export async function mapRegionAnchor(serverId: string, dim: Dim) {
  // Read just the four extremes, including regions outside the current viewport and API page.
  const extreme = async (axis: "rx" | "rz", ascending: boolean) => {
    const { data, error } = await db()
      .from("map_regions")
      .select(axis)
      .eq("server_id", serverId)
      .eq("dim", dim)
      .order(axis, { ascending })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`map region extent: ${error.message}`);
    return data ? (data as Record<typeof axis, number>)[axis] : null;
  };
  const [minX, maxX, minZ, maxZ] = await Promise.all([
    extreme("rx", true),
    extreme("rx", false),
    extreme("rz", true),
    extreme("rz", false),
  ]);
  if (minX === null || maxX === null || minZ === null || maxZ === null)
    return null;
  return { rx: (minX + maxX) / 2, rz: (minZ + maxZ) / 2 };
}
