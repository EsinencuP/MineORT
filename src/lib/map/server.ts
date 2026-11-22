import "server-only";
import { db } from "@/lib/supabase-admin";
import { rebuildRegion, type Dim } from "./regions";
import type { Layer } from "./vectorize";

export const MAX_REGIONS_PER_REQUEST = 9;
/** A viewer may trigger at most this many rebuilds per request; the rest are served as they are. */
const MAX_REBUILDS_PER_REQUEST = 2;
/** The ingest pipeline gets this long to rebuild a changed region before a viewer's request does. */
const REBUILD_AFTER_MS = 20_000;

export type RegionPayload =
  | { rx: number; rz: number; version: number; unchanged: true }
  | { rx: number; rz: number; version: number; layer: Layer };

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
  layer: Layer | null;
  built_version: number;
  dirty: boolean;
  dirty_at: string;
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
  const { data, error } = await db()
    .from("map_regions")
    .select("layer, built_version, dirty, dirty_at")
    .eq("server_id", serverId)
    .eq("dim", dim)
    .eq("rx", rx)
    .eq("rz", rz)
    .maybeSingle();
  if (error) throw new Error(`map_regions read: ${error.message}`);
  return data as Row | null;
}

/**
 * The drawn layers of the requested regions. A region with no layer yet is built now; a changed
 * region is served as it was until the ingest pipeline has had time to rebuild it.
 * A region the viewer already holds at the same version comes back as `unchanged`; a region nobody
 * has explored is left out.
 */
export async function loadRegions(
  serverId: string,
  dim: Dim,
  refs: { rx: number; rz: number }[],
  known: Map<string, number>,
): Promise<RegionPayload[]> {
  const out: RegionPayload[] = [];
  let rebuilds = 0;
  for (const { rx, rz } of refs.slice(0, MAX_REGIONS_PER_REQUEST)) {
    let row = await readRow(serverId, dim, rx, rz);
    if (!row) continue;
    // A built region that changed a moment ago is served as it is. Rebuilding is for a region that
    // has no layer yet, or that the ingest pipeline has left dirty for too long.
    const overdue =
      row.dirty && Date.now() - Date.parse(row.dirty_at) > REBUILD_AFTER_MS;
    if ((!row.layer || overdue) && rebuilds < MAX_REBUILDS_PER_REQUEST) {
      rebuilds++;
      await rebuildOnce(serverId, dim, rx, rz);
      row = await readRow(serverId, dim, rx, rz);
    }
    if (!row?.layer) continue;
    const version = Number(row.built_version);
    if (known.get(`${rx}:${rz}`) === version) {
      out.push({ rx, rz, version, unchanged: true });
    } else {
      out.push({ rx, rz, version, layer: row.layer! });
    }
  }
  return out;
}

/** Coordinates of every explored region, so the viewer knows where to look. */
export async function listRegions(
  serverId: string,
  dim: Dim,
): Promise<{ rx: number; rz: number }[]> {
  const { data, error } = await db()
    .from("map_regions")
    .select("rx, rz")
    .eq("server_id", serverId)
    .eq("dim", dim)
    .limit(500);
  if (error) throw new Error(`map_regions list: ${error.message}`);
  return data as { rx: number; rz: number }[];
}
