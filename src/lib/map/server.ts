import "server-only";
import { db } from "@/lib/supabase-admin";
import { rebuildRegion, type Dim } from "./regions";
import type { Layer } from "./vectorize";

export const MAX_REGIONS_PER_REQUEST = 9;

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
};

async function readRow(serverId: string, dim: Dim, rx: number, rz: number) {
  const { data, error } = await db()
    .from("map_regions")
    .select("layer, built_version, dirty")
    .eq("server_id", serverId)
    .eq("dim", dim)
    .eq("rx", rx)
    .eq("rz", rz)
    .maybeSingle();
  if (error) throw new Error(`map_regions read: ${error.message}`);
  return data as Row | null;
}

/**
 * The drawn layers of the requested regions. A region still waiting for a rebuild is rebuilt now.
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
  for (const { rx, rz } of refs.slice(0, MAX_REGIONS_PER_REQUEST)) {
    let row = await readRow(serverId, dim, rx, rz);
    if (!row) continue;
    if (row.dirty || !row.layer) {
      await rebuildRegion({ serverId, dim, rx, rz });
      row = await readRow(serverId, dim, rx, rz);
      if (!row?.layer) continue;
    }
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
