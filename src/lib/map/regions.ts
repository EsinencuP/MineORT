import "server-only";
import { db } from "@/lib/supabase-admin";
import { decodeChunk, type ChunkColumns } from "./chunk-codec";
import { renderTile } from "./tile/render";

export type Dim = "overworld" | "nether";
export type RegionRef = { serverId: string; dim: Dim; rx: number; rz: number };

type ChunkRow = { cx: number; cz: number; version: number; data: string };

/** PostgREST returns bytea as `\x` followed by hex. */
const fromBytea = (value: string) => Buffer.from(value.slice(2), "hex");

/** Two half-region reads, so each stays under the API's row cap. */
async function loadChunks(ref: RegionRef) {
  const chunks = new Map<string, ChunkColumns>();
  let newest = 0;
  for (const half of [0, 16]) {
    const { data, error } = await db()
      .from("map_chunks")
      .select("cx, cz, version, data")
      .eq("server_id", ref.serverId)
      .eq("dim", ref.dim)
      .eq("rx", ref.rx)
      .eq("rz", ref.rz)
      .gte("cz", ref.rz * 32 + half)
      .lt("cz", ref.rz * 32 + half + 16);
    if (error) throw new Error(`map_chunks read: ${error.message}`);
    for (const row of data as ChunkRow[]) {
      chunks.set(`${row.cx},${row.cz}`, decodeChunk(fromBytea(row.data)));
      newest = Math.max(newest, Number(row.version));
    }
  }
  return { chunks, newest };
}

/**
 * Rebuilds one dirty region into a PNG tile. The new tile is stored only if nothing marked the
 * region dirty again in the meantime, so a chunk that arrives while a build runs keeps the region
 * dirty for the next one. Returns whether a tile was stored.
 */
export async function rebuildRegion(ref: RegionRef): Promise<boolean> {
  const { data: row, error } = await db()
    .from("map_regions")
    .select("dirty, dirty_at")
    .eq("server_id", ref.serverId)
    .eq("dim", ref.dim)
    .eq("rx", ref.rx)
    .eq("rz", ref.rz)
    .maybeSingle();
  if (error) throw new Error(`map_regions read: ${error.message}`);
  if (!row?.dirty) return false;

  const { chunks, newest } = await loadChunks(ref);
  const tile = renderTile(ref.rx, ref.rz, chunks);

  const { data: stored, error: writeError } = await db().rpc("map_store_tile", {
    p_server_id: ref.serverId,
    p_dim: ref.dim,
    p_rx: ref.rx,
    p_rz: ref.rz,
    p_dirty_at: row.dirty_at,
    p_tile: tile.toString("base64"),
    p_version: newest,
  });
  if (writeError) throw new Error(`map_store_tile: ${writeError.message}`);
  return stored === true;
}

/** Rebuilds the regions touched by a batch, oldest changes first, at most `limit` of them. */
export async function rebuildRegions(refs: RegionRef[], limit = 4) {
  const seen = new Set<string>();
  let built = 0;
  for (const ref of refs) {
    const key = `${ref.serverId}:${ref.dim}:${ref.rx}:${ref.rz}`;
    if (seen.has(key) || built >= limit) continue;
    seen.add(key);
    if (await rebuildRegion(ref)) built++;
  }
  return built;
}
