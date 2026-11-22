import { deflateSync, inflateSync } from "node:zlib";

/**
 * Wire format of one chunk as the Paper plugin sends it (zlib-compressed):
 *
 *   byte    codec version (1)
 *   byte    palette size n (biome names used in this chunk)
 *   n times byte length + UTF-8 name
 *   256 x   uint16 LE height + 64   (top solid or water surface, Y -64..320)
 *   256 x   uint8 surface class     (SURFACE)
 *   256 x   uint8 biome palette index
 *   256 x   uint8 water depth in blocks (0 on dry land)
 *
 * Columns are ordered z-major: index = z * 16 + x, both local to the chunk (0..15).
 */
export const CHUNK_CODEC_VERSION = 1;
export const COLUMNS = 256;
const MAX_RAW_BYTES = 8 * 1024;
const HEIGHT_OFFSET = 64;

export const SURFACE = {
  unknown: 0,
  water: 1,
  deep_water: 2,
  sand: 3,
  grass: 4,
  forest: 5,
  snow: 6,
  stone: 7,
  path: 8,
  built: 9,
  lava: 10,
  ice: 11,
  farmland: 12,
  dirt: 13,
  swamp: 14,
} as const;

export type Surface = (typeof SURFACE)[keyof typeof SURFACE];
const SURFACE_VALUES = new Set<number>(Object.values(SURFACE));

export type Column = {
  height: number;
  surface: Surface;
  biome: string;
  waterDepth: number;
};
export type ChunkColumns = { columns: Column[] };

export function encodeChunk(chunk: ChunkColumns): Buffer {
  if (chunk.columns.length !== COLUMNS) {
    throw new Error(`chunk needs ${COLUMNS} columns`);
  }
  const palette = [...new Set(chunk.columns.map((c) => c.biome))];
  const names = palette.map((n) => Buffer.from(n, "utf8"));
  const head = [Buffer.from([CHUNK_CODEC_VERSION, palette.length])];
  for (const name of names) head.push(Buffer.from([name.length]), name);

  const heights = Buffer.alloc(COLUMNS * 2);
  const surfaces = Buffer.alloc(COLUMNS);
  const biomes = Buffer.alloc(COLUMNS);
  const depths = Buffer.alloc(COLUMNS);
  chunk.columns.forEach((c, i) => {
    heights.writeUInt16LE(c.height + HEIGHT_OFFSET, i * 2);
    surfaces[i] = c.surface;
    biomes[i] = palette.indexOf(c.biome);
    depths[i] = c.waterDepth;
  });
  return deflateSync(
    Buffer.concat([...head, heights, surfaces, biomes, depths]),
  );
}

export function decodeChunk(data: Buffer): ChunkColumns {
  const raw = inflateSync(data, { maxOutputLength: MAX_RAW_BYTES });
  if (raw.length < 2) throw new Error("chunk payload length is too short");
  if (raw[0] !== CHUNK_CODEC_VERSION) {
    throw new Error(`unsupported codec version ${raw[0]}`);
  }
  const paletteSize = raw[1];
  let at = 2;
  const palette: string[] = [];
  for (let i = 0; i < paletteSize; i++) {
    const len = raw[at];
    if (len === undefined || at + 1 + len > raw.length) {
      throw new Error("chunk payload length does not match the layout");
    }
    palette.push(raw.subarray(at + 1, at + 1 + len).toString("utf8"));
    at += 1 + len;
  }
  if (raw.length - at !== COLUMNS * 5) {
    throw new Error("chunk payload length does not match the layout");
  }
  const heightsAt = at;
  const surfacesAt = heightsAt + COLUMNS * 2;
  const biomesAt = surfacesAt + COLUMNS;
  const depthsAt = biomesAt + COLUMNS;

  const columns: Column[] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const surface = raw[surfacesAt + i];
    if (!SURFACE_VALUES.has(surface)) {
      throw new Error(`unknown surface class ${surface}`);
    }
    const biome = palette[raw[biomesAt + i]];
    if (biome === undefined) throw new Error("biome index outside the palette");
    columns.push({
      height: raw.readUInt16LE(heightsAt + i * 2) - HEIGHT_OFFSET,
      surface: surface as Surface,
      biome,
      waterDepth: raw[depthsAt + i],
    });
  }
  return { columns };
}
