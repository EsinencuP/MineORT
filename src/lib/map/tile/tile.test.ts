import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { COLUMNS, type ChunkColumns } from "../chunk-codec";
import { papyrus } from "./papyrus";
import { encodePng } from "./png";
import { renderTile, TILE_SIZE } from "./render";

const rgb = (argb: number) => [
  (argb >> 16) & 0xff,
  (argb >> 8) & 0xff,
  argb & 0xff,
];

describe("papyrus palette (port of the AtlasMap scanner)", () => {
  it("paints deep water blue-grey, soaked into the parchment", () => {
    // wx=1 is off the hatching pattern
    expect(rgb(papyrus(0xff4040ff, 60, 60, 60, 14, 1, 1))).toEqual([
      86, 115, 122,
    ]);
  });

  it("engraves wave hatching on part of the water", () => {
    expect(rgb(papyrus(0xff4040ff, 60, 60, 60, 14, 0, 0))).toEqual([
      80, 104, 113,
    ]);
  });

  it("darkens land where a contour line passes", () => {
    const flat = papyrus(0xff7fb238, 64, 64, 64, 0, 3, 3);
    const edge = papyrus(0xff7fb238, 64, 63, 64, 0, 3, 3); // 63 and 64 lie in different 8-block bands
    const sum = (c: number) => rgb(c).reduce((a, b) => a + b, 0);
    expect(sum(edge)).toBeLessThan(sum(flat) * 1.05);
    expect(sum(papyrus(0xff7fb238, 66, 64, 66, 0, 3, 3))).toBeGreaterThan(0);
  });

  it("shades a slope that rises away from the north darker or lighter than flat ground", () => {
    const flat = papyrus(0xff7fb238, 65, 65, 65, 0, 3, 3);
    const up = papyrus(0xff7fb238, 67, 65, 65, 0, 3, 3);
    const down = papyrus(0xff7fb238, 63, 65, 65, 0, 3, 3);
    expect(rgb(up)[1]).toBeGreaterThan(rgb(flat)[1]);
    expect(rgb(down)[1]).toBeLessThan(rgb(flat)[1]);
  });

  it("always returns an opaque colour", () => {
    expect(papyrus(0xffffffff, 90, 60, 60, 0, 0, 0) >>> 24).toBe(0xff);
  });
});

describe("png encoder", () => {
  it("writes a decodable image with the requested pixels", () => {
    const px = new Uint8Array(2 * 2 * 4);
    px.set([255, 0, 0, 255], 0);
    px.set([0, 255, 0, 128], 4);
    const png = encodePng(px, 2, 2);
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.readUInt32BE(16)).toBe(2); // IHDR width
    const idatAt = png.indexOf("IDAT");
    const len = png.readUInt32BE(idatAt - 4);
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len));
    expect([...raw.subarray(1, 9)]).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
  });
});

describe("tile renderer", () => {
  const solid = (color: number, height = 64, waterDepth = 0): ChunkColumns => ({
    columns: Array.from({ length: COLUMNS }, () => ({
      height,
      color,
      waterDepth,
    })),
  });
  const pixels = (png: Buffer) => {
    const at = png.indexOf("IDAT");
    const len = png.readUInt32BE(at - 4);
    const raw = inflateSync(png.subarray(at + 4, at + 4 + len));
    const stride = TILE_SIZE * 4 + 1;
    return (x: number, y: number) =>
      [...raw.subarray(y * stride + 1 + x * 4, y * stride + 1 + x * 4 + 4)];
  };

  it("leaves unexplored blocks transparent and paints explored ones", () => {
    const png = renderTile(0, 0, new Map([["0,0", solid(0xff7fb238)]]));
    const at = pixels(png);
    expect(at(5, 5)[3]).toBe(255);
    expect(at(16, 5)).toEqual([0, 0, 0, 0]); // the next chunk is unexplored
  });

  it("places a chunk of another region at its own offset", () => {
    const png = renderTile(1, -1, new Map([["32,-1", solid(0xff7fb238)]]));
    const at = pixels(png);
    expect(at(0, 496)[3]).toBe(255); // chunk (32,-1) is the region's column 0, row 31
    expect(at(0, 0)[3]).toBe(0);
  });

  it("skips columns that have no colour", () => {
    const chunk = solid(0xff7fb238);
    chunk.columns[0].color = 0;
    const at = pixels(renderTile(0, 0, new Map([["0,0", chunk]])));
    expect(at(0, 0)[3]).toBe(0);
    expect(at(1, 0)[3]).toBe(255);
  });

  it("reads the height across a chunk border from the neighbour", () => {
    const a = solid(0xff7fb238, 70);
    const lower = solid(0xff7fb238, 60); // the chunk to the west of a
    const withNeighbour = pixels(
      renderTile(
        0,
        0,
        new Map([
          ["1,0", a],
          ["0,0", lower],
        ]),
      ),
    )(16, 4);
    const alone = pixels(renderTile(0, 0, new Map([["1,0", a]])))(16, 4);
    expect(withNeighbour).not.toEqual(alone);
  });
});
