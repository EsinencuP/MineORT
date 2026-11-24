import { deflateSync, inflateSync } from "node:zlib";

/**
 * Wire format of one chunk as the Paper plugin sends it (zlib-compressed), codec version 2.
 * It carries what the AtlasMap mod's ChunkScanner reads for every column of the chunk:
 * the surface height, the depth of water above the sea floor and the vanilla map colour.
 *
 *   byte    codec version (2)
 *   256 x   uint16 LE height + 64   (top solid or water surface, Y -64..320)
 *   256 x   uint8 water depth in blocks (0 on dry land)
 *   256 x   uint32 LE colour 0xAARRGGBB (the block's vanilla map colour, alpha FF; 0 = nothing here)
 *
 * Columns are ordered z-major: index = z * 16 + x, both local to the chunk (0..15).
 */
export const CHUNK_CODEC_VERSION = 2;
export const COLUMNS = 256;
const MAX_RAW_BYTES = 8 * 1024;
const HEIGHT_OFFSET = 64;

export type Column = {
  height: number;
  /** 0xFFRRGGBB as an unsigned number, or 0 when the column has no colour (empty sky, void). */
  color: number;
  waterDepth: number;
};
export type ChunkColumns = { columns: Column[] };

export function encodeChunk(chunk: ChunkColumns): Buffer {
  if (chunk.columns.length !== COLUMNS) {
    throw new Error(`chunk needs ${COLUMNS} columns`);
  }
  const heights = Buffer.alloc(COLUMNS * 2);
  const depths = Buffer.alloc(COLUMNS);
  const colors = Buffer.alloc(COLUMNS * 4);
  chunk.columns.forEach((c, i) => {
    heights.writeUInt16LE(c.height + HEIGHT_OFFSET, i * 2);
    depths[i] = c.waterDepth;
    colors.writeUInt32LE(c.color >>> 0, i * 4);
  });
  return deflateSync(
    Buffer.concat([
      Buffer.from([CHUNK_CODEC_VERSION]),
      heights,
      depths,
      colors,
    ]),
  );
}

export function decodeChunk(data: Buffer): ChunkColumns {
  const raw = inflateSync(data, { maxOutputLength: MAX_RAW_BYTES });
  if (raw.length < 1) throw new Error("chunk payload length is too short");
  if (raw[0] !== CHUNK_CODEC_VERSION) {
    throw new Error(`unsupported codec version ${raw[0]}`);
  }
  if (raw.length - 1 !== COLUMNS * 7) {
    throw new Error("chunk payload length does not match the layout");
  }
  const heightsAt = 1;
  const depthsAt = heightsAt + COLUMNS * 2;
  const colorsAt = depthsAt + COLUMNS;

  const columns: Column[] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const color = raw.readUInt32LE(colorsAt + i * 4);
    if (color !== 0 && color >>> 24 !== 0xff) {
      throw new Error("column colour must be opaque or zero");
    }
    columns.push({
      height: raw.readUInt16LE(heightsAt + i * 2) - HEIGHT_OFFSET,
      color,
      waterDepth: raw[depthsAt + i],
    });
  }
  return { columns };
}
