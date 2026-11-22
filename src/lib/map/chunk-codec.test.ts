import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  CHUNK_CODEC_VERSION,
  COLUMNS,
  decodeChunk,
  encodeChunk,
  SURFACE,
  type ChunkColumns,
} from "./chunk-codec";

function sample(): ChunkColumns {
  const columns: ChunkColumns["columns"] = [];
  for (let i = 0; i < COLUMNS; i++) {
    columns.push({
      height: -64 + i, // covers the full usable range of heights including negatives
      surface: (i % 15) as ChunkColumns["columns"][number]["surface"],
      biome: i % 3 === 0 ? "minecraft:plains" : "minecraft:river",
      waterDepth: i % 256,
    });
  }
  return { columns };
}

/** Wire bytes assembled by hand from the format description, independent of the encoder. */
function handBuilt(): Buffer {
  const heights = Buffer.alloc(COLUMNS * 2);
  const surfaces = Buffer.alloc(COLUMNS);
  const biomes = Buffer.alloc(COLUMNS);
  const depths = Buffer.alloc(COLUMNS);
  for (let i = 0; i < COLUMNS; i++) {
    heights.writeUInt16LE(70 + 64, i * 2); // stored as height + 64
    surfaces[i] = 4; // grass
    biomes[i] = 0;
    depths[i] = 0;
  }
  surfaces[0] = 2; // deep water in the first column
  depths[0] = 7;
  biomes[0] = 1;
  const name0 = Buffer.from("minecraft:plains");
  const name1 = Buffer.from("minecraft:ocean");
  return Buffer.concat([
    Buffer.from([1, 2]), // codec version, palette size
    Buffer.from([name0.length]),
    name0,
    Buffer.from([name1.length]),
    name1,
    heights,
    surfaces,
    biomes,
    depths,
  ]);
}

describe("chunk codec", () => {
  it("round-trips all 256 columns including negative heights", () => {
    const input = sample();
    expect(decodeChunk(encodeChunk(input))).toEqual(input);
  });

  it("reads bytes the plugin writes by the documented layout", () => {
    const decoded = decodeChunk(deflateSync(handBuilt()));
    expect(decoded.columns).toHaveLength(COLUMNS);
    expect(decoded.columns[0]).toEqual({
      height: 70,
      surface: SURFACE.deep_water,
      biome: "minecraft:ocean",
      waterDepth: 7,
    });
    expect(decoded.columns[255]).toEqual({
      height: 70,
      surface: SURFACE.grass,
      biome: "minecraft:plains",
      waterDepth: 0,
    });
  });

  it("rejects an unknown codec version", () => {
    const bytes = handBuilt();
    bytes[0] = CHUNK_CODEC_VERSION + 1;
    expect(() => decodeChunk(deflateSync(bytes))).toThrow(/codec version/);
  });

  it("rejects a payload that is not zlib data", () => {
    expect(() => decodeChunk(Buffer.from("not compressed"))).toThrow();
  });

  it("rejects a payload whose length does not match the layout", () => {
    expect(() =>
      decodeChunk(deflateSync(handBuilt().subarray(0, 100))),
    ).toThrow(/length/);
  });

  it("rejects a biome index outside the palette", () => {
    const bytes = handBuilt();
    const biomeOffset = bytes.length - COLUMNS * 2; // biome block precedes the depth block
    bytes[biomeOffset + 5] = 9;
    expect(() => decodeChunk(deflateSync(bytes))).toThrow(/palette/);
  });

  it("rejects a surface class outside the known set", () => {
    const bytes = handBuilt();
    const surfaceOffset = bytes.length - COLUMNS * 3;
    bytes[surfaceOffset + 3] = 200;
    expect(() => decodeChunk(deflateSync(bytes))).toThrow(/surface/);
  });

  it("rejects compressed data that expands beyond the limit", () => {
    expect(() => decodeChunk(deflateSync(Buffer.alloc(1_000_000)))).toThrow();
  });
});
