import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  CHUNK_CODEC_VERSION,
  COLUMNS,
  decodeChunk,
  encodeChunk,
  type ChunkColumns,
} from "./chunk-codec";

function sample(): ChunkColumns {
  const columns: ChunkColumns["columns"] = [];
  for (let i = 0; i < COLUMNS; i++) {
    columns.push({
      height: -64 + i, // covers the full usable range of heights including negatives
      color: i % 7 === 0 ? 0 : (0xff000000 | (i * 0x010203)) >>> 0,
      waterDepth: i % 256,
    });
  }
  return { columns };
}

/** Wire bytes assembled by hand from the format description, independent of the encoder. */
function handBuilt(): Buffer {
  const heights = Buffer.alloc(COLUMNS * 2);
  const depths = Buffer.alloc(COLUMNS);
  const colors = Buffer.alloc(COLUMNS * 4);
  for (let i = 0; i < COLUMNS; i++) {
    heights.writeUInt16LE(70 + 64, i * 2); // stored as height + 64
    colors.writeUInt32LE(0xff7fb238, i * 4); // vanilla grass map colour
  }
  depths[0] = 7;
  colors.writeUInt32LE(0xff4040ff, 0); // water in the first column
  colors.writeUInt32LE(0, 4); // nothing in the second
  return Buffer.concat([
    Buffer.from([CHUNK_CODEC_VERSION]),
    heights,
    depths,
    colors,
  ]);
}

describe("chunk codec", () => {
  it("round-trips all 256 columns including negative heights and empty columns", () => {
    const input = sample();
    expect(decodeChunk(encodeChunk(input))).toEqual(input);
  });

  it("reads bytes the plugin writes by the documented layout", () => {
    const decoded = decodeChunk(deflateSync(handBuilt()));
    expect(decoded.columns).toHaveLength(COLUMNS);
    expect(decoded.columns[0]).toEqual({
      height: 70,
      color: 0xff4040ff,
      waterDepth: 7,
    });
    expect(decoded.columns[1].color).toBe(0);
    expect(decoded.columns[255]).toEqual({
      height: 70,
      color: 0xff7fb238,
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

  it("rejects a colour that is neither opaque nor zero", () => {
    const bytes = handBuilt();
    bytes.writeUInt32LE(0x807fb238, bytes.length - 4);
    expect(() => decodeChunk(deflateSync(bytes))).toThrow(/opaque/);
  });

  it("rejects compressed data that expands beyond the limit", () => {
    expect(() => decodeChunk(deflateSync(Buffer.alloc(1_000_000)))).toThrow();
  });
});
