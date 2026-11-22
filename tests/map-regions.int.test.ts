import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridgeServer } from "@/lib/bridge/keys";
import { COLUMNS, encodeChunk, SURFACE } from "@/lib/map/chunk-codec";
import { rebuildRegion, rebuildRegions } from "@/lib/map/regions";
import type { Layer } from "@/lib/map/vectorize";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project.
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.BRIDGE_KEK;

let serverId = "";
const ref = (rx: number, rz: number) => ({
  serverId,
  dim: "overworld" as const,
  rx,
  rz,
});

/** A chunk that is all water, or all grass. */
function chunk(cx: number, cz: number, version: number, water: boolean) {
  const data = encodeChunk({
    columns: Array.from({ length: COLUMNS }, () => ({
      height: 64,
      surface: water ? SURFACE.water : SURFACE.grass,
      biome: "minecraft:plains",
      waterDepth: water ? 2 : 0,
    })),
  }).toString("base64");
  return { dim: "overworld", cx, cz, codec: 1, version, data };
}

async function ingest(chunks: ReturnType<typeof chunk>[]) {
  const { error } = await db().rpc("map_ingest_chunks", {
    p_server_id: serverId,
    p_chunks: chunks,
  });
  expect(error).toBeNull();
}

const stored = async (rx: number, rz: number) => {
  const { data } = await db()
    .from("map_regions")
    .select("layer, dirty, built_version")
    .eq("server_id", serverId)
    .eq("dim", "overworld")
    .eq("rx", rx)
    .eq("rz", rz)
    .single();
  return data as { layer: Layer | null; dirty: boolean; built_version: number };
};

describe.skipIf(!enabled)("region rebuild", () => {
  beforeAll(async () => {
    serverId = await createBridgeServer(`map-regions-${Date.now()}`);
  });
  afterAll(async () => {
    await db().from("map_chunks").delete().eq("server_id", serverId);
    await db().from("map_regions").delete().eq("server_id", serverId);
    await db().from("bridge_servers").delete().eq("id", serverId);
  });

  it("builds the layer of a dirty region from its stored chunks", async () => {
    // a 3x3 block of water chunks inside an otherwise land region
    const chunks = [];
    for (let cz = 10; cz < 13; cz++) {
      for (let cx = 10; cx < 13; cx++) chunks.push(chunk(cx, cz, 7, true));
    }
    chunks.push(chunk(20, 20, 3, false));
    await ingest(chunks);

    expect(await rebuildRegion(ref(0, 0))).toBe(true);
    const row = await stored(0, 0);
    expect(row.dirty).toBe(false);
    expect(row.built_version).toBe(7);
    expect(row.layer!.areas.water.rings).toHaveLength(1);
    const xs = row.layer!.areas.water.rings[0].filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(160, 0); // chunk 10 starts at block 160
    expect(Math.max(...xs)).toBeCloseTo(208, 0); // chunk 12 ends at block 208
  });

  it("does nothing for a region that is not dirty", async () => {
    expect(await rebuildRegion(ref(0, 0))).toBe(false);
  });

  it("marks the region dirty again when a newer chunk arrives and rebuilds it", async () => {
    await ingest([chunk(11, 11, 9, false)]); // the middle water chunk turns to grass
    expect((await stored(0, 0)).dirty).toBe(true);

    expect(await rebuildRegion(ref(0, 0))).toBe(true);
    const row = await stored(0, 0);
    expect(row.built_version).toBe(9);
    expect(row.layer!.areas.water.rings).toHaveLength(2); // a ring with a hole
  });

  it("refuses to store a layer built before a newer chunk arrived", async () => {
    await ingest([chunk(0, 0, 1, true)]);
    const { data: read } = await db()
      .from("map_regions")
      .select("dirty_at")
      .eq("server_id", serverId)
      .eq("rx", 0)
      .eq("rz", 0)
      .single(); // the state a build would have read
    await ingest([chunk(0, 0, 2, false)]); // a chunk lands while that build runs

    const { data: accepted, error } = await db().rpc("map_store_layer", {
      p_server_id: serverId,
      p_dim: "overworld",
      p_rx: 0,
      p_rz: 0,
      p_dirty_at: read!.dirty_at,
      p_layer: { stale: true },
      p_version: 1,
    });
    expect(error).toBeNull();
    expect(accepted).toBe(false);
    const row = await stored(0, 0);
    expect(row.dirty).toBe(true);
    expect(row.layer).not.toEqual({ stale: true });
    expect(await rebuildRegion(ref(0, 0))).toBe(true); // the next build catches up
    expect((await stored(0, 0)).dirty).toBe(false);
  });

  it("rebuilds at most the given number of regions and skips repeats", async () => {
    await ingest([chunk(32, 0, 1, true), chunk(64, 0, 1, true)]);
    const built = await rebuildRegions([ref(1, 0), ref(1, 0), ref(2, 0)], 1);
    expect(built).toBe(1);
    expect((await stored(2, 0)).dirty).toBe(true);
  });
});
