import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridgeServer } from "@/lib/bridge/keys";
import { COLUMNS, encodeChunk } from "@/lib/map/chunk-codec";
import { rebuildRegion, rebuildRegions } from "@/lib/map/regions";
import { listRegions, loadTile } from "@/lib/map/server";
import { TILE_SIZE } from "@/lib/map/tile/render";
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
      color: water ? 0xff4040ff : 0xff7fb238,
      waterDepth: water ? 14 : 0,
    })),
  }).toString("base64");
  return { dim: "overworld", cx, cz, codec: 2, version, data };
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
    .select("tile, dirty, built_version")
    .eq("server_id", serverId)
    .eq("dim", "overworld")
    .eq("rx", rx)
    .eq("rz", rz)
    .single();
  return data as { tile: string | null; dirty: boolean; built_version: number };
};

/** RGBA of one pixel of a PNG made by the tile encoder (filter 0 on every row). */
function pixel(png: Buffer, x: number, y: number) {
  const at = png.indexOf("IDAT");
  const raw = inflateSync(
    png.subarray(at + 4, at + 4 + png.readUInt32BE(at - 4)),
  );
  const o = y * (TILE_SIZE * 4 + 1) + 1 + x * 4;
  return [...raw.subarray(o, o + 4)];
}
const tileOf = async (rx: number, rz: number) => {
  const row = await stored(rx, rz);
  return Buffer.from(row.tile!.slice(2), "hex");
};
const isWater = (p: number[]) => p[2] > p[0]; // blue-grey, unlike the sepia land

describe.skipIf(!enabled)("region rebuild", () => {
  beforeAll(async () => {
    serverId = await createBridgeServer(`map-regions-${Date.now()}`);
  });
  afterAll(async () => {
    await db().from("map_chunks").delete().eq("server_id", serverId);
    await db().from("map_regions").delete().eq("server_id", serverId);
    await db().from("bridge_servers").delete().eq("id", serverId);
  });

  it("paints the tile of a dirty region from its stored chunks", async () => {
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
    const png = await tileOf(0, 0);
    expect(isWater(pixel(png, 168, 168))).toBe(true); // inside chunk 10,10
    expect(isWater(pixel(png, 330, 330))).toBe(false); // the grass chunk 20,20
    expect(pixel(png, 5, 5)[3]).toBe(0); // unexplored stays transparent
  });

  it("does nothing for a region that is not dirty", async () => {
    expect(await rebuildRegion(ref(0, 0))).toBe(false);
  });

  it("marks the region dirty again when a newer chunk arrives and rebuilds it", async () => {
    await ingest([chunk(11, 11, 9, false)]); // the middle water chunk turns to grass
    expect((await stored(0, 0)).dirty).toBe(true);

    expect(await rebuildRegion(ref(0, 0))).toBe(true);
    expect((await stored(0, 0)).built_version).toBe(9);
    const png = await tileOf(0, 0);
    expect(isWater(pixel(png, 184, 184))).toBe(false); // the middle chunk is land now
    expect(isWater(pixel(png, 168, 168))).toBe(true);
  });

  it("refuses to store a tile built before a newer chunk arrived", async () => {
    await ingest([chunk(0, 0, 1, true)]);
    const { data: read } = await db()
      .from("map_regions")
      .select("dirty_at")
      .eq("server_id", serverId)
      .eq("rx", 0)
      .eq("rz", 0)
      .single(); // the state a build would have read
    await ingest([chunk(0, 0, 2, false)]); // a chunk lands while that build runs

    const { data: accepted, error } = await db().rpc("map_store_tile", {
      p_server_id: serverId,
      p_dim: "overworld",
      p_rx: 0,
      p_rz: 0,
      p_dirty_at: read!.dirty_at,
      p_tile: Buffer.from("stale").toString("base64"),
      p_version: 1,
    });
    expect(error).toBeNull();
    expect(accepted).toBe(false);
    const row = await stored(0, 0);
    expect(row.dirty).toBe(true);
    expect(await rebuildRegion(ref(0, 0))).toBe(true); // the next build catches up
    expect((await stored(0, 0)).dirty).toBe(false);
  });

  it("rebuilds at most the given number of regions and skips repeats", async () => {
    await ingest([chunk(32, 0, 1, true), chunk(64, 0, 1, true)]);
    const built = await rebuildRegions([ref(1, 0), ref(1, 0), ref(2, 0)], 1);
    expect(built).toBe(1);
    expect((await stored(2, 0)).dirty).toBe(true);
  });

  it("serves a dirty region rebuilt on the spot", async () => {
    await ingest([chunk(96, 0, 4, true)]); // region 3,0 becomes dirty and is not rebuilt yet
    expect((await stored(3, 0)).dirty).toBe(true);

    const tile = await loadTile(serverId, "overworld", 3, 0);
    expect(tile?.version).toBe(4);
    expect(tile!.png.subarray(1, 4).toString()).toBe("PNG");
    expect((await stored(3, 0)).dirty).toBe(false);
  });

  it("answers null for a region nobody has explored", async () => {
    expect(await loadTile(serverId, "overworld", 50, 50)).toBeNull();
  });

  it("lists the explored regions with the version of their tile", async () => {
    const list = await listRegions(serverId, "overworld", {
      minX: 3,
      maxX: 3,
      minZ: 0,
      maxZ: 0,
    });
    expect(list).toContainEqual({ rx: 3, rz: 0, version: 4 });
  });

  it("returns region 501 without pulling in a region outside the viewport", async () => {
    const fixture = Array.from({ length: 501 }, (_, i) => ({
      server_id: serverId,
      dim: "nether",
      rx: 100 + Math.floor(i / 26),
      rz: 200 + (i % 26),
      built_version: i + 1,
      dirty: false,
    }));
    const outside = { ...fixture[0], rx: 150 };
    const { error } = await db()
      .from("map_regions")
      .insert([...fixture, outside]);
    if (error) throw error;
    const regions = await listRegions(serverId, "nether", {
      minX: 100,
      maxX: 120,
      minZ: 200,
      maxZ: 225,
    });
    expect(regions).toHaveLength(501);
    expect(regions.at(-1)).toEqual({
      rx: fixture[500].rx,
      rz: fixture[500].rz,
      version: 501,
    });
  });

  it("serves a recently changed region as it was instead of rebuilding it", async () => {
    await ingest([chunk(160, 0, 4, true)]); // region 5,0 appears
    await loadTile(serverId, "overworld", 5, 0); // builds it
    await ingest([chunk(160, 0, 5, false)]); // changes it: dirty, but only just

    const out = await loadTile(serverId, "overworld", 5, 0);
    expect(out?.version).toBe(4); // the old tile
    expect((await stored(5, 0)).dirty).toBe(true); // and not rebuilt by this request
  });

  it("rebuilds a region that has stayed dirty for too long", async () => {
    await db()
      .from("map_regions")
      .update({ dirty_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("server_id", serverId)
      .eq("rx", 5)
      .eq("rz", 0);
    const out = await loadTile(serverId, "overworld", 5, 0);
    expect(out?.version).toBe(5);
    expect((await stored(5, 0)).dirty).toBe(false);
  });
});
