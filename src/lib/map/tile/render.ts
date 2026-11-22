import type { ChunkColumns } from "../chunk-codec";
import { papyrus } from "./papyrus";
import { encodePng } from "./png";

/** A region is 32 x 32 chunks: 512 x 512 blocks, one pixel per block. */
export const REGION_CHUNKS = 32;
export const TILE_SIZE = REGION_CHUNKS * 16;

/**
 * Paints one region into a PNG, one pixel per block, the way the AtlasMap mod paints its tiles:
 * shaded by the slope towards the north and west neighbours. Blocks nobody has explored stay
 * transparent, so the parchment of the page shows through. A neighbour in a chunk that has not
 * arrived yet counts as flat.
 */
export function renderTile(
  rx: number,
  rz: number,
  chunks: Map<string, ChunkColumns>,
): Buffer {
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const view = new DataView(rgba.buffer);
  const height = (cx: number, cz: number, lx: number, lz: number) =>
    chunks.get(`${cx},${cz}`)?.columns[lz * 16 + lx].height;

  for (let lcz = 0; lcz < REGION_CHUNKS; lcz++) {
    for (let lcx = 0; lcx < REGION_CHUNKS; lcx++) {
      const cx = rx * REGION_CHUNKS + lcx;
      const cz = rz * REGION_CHUNKS + lcz;
      const chunk = chunks.get(`${cx},${cz}`);
      if (!chunk) continue;
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const col = chunk.columns[lz * 16 + lx];
          if (col.color === 0) continue;
          const h = col.height;
          const hn =
            lz > 0
              ? chunk.columns[(lz - 1) * 16 + lx].height
              : (height(cx, cz - 1, lx, 15) ?? h);
          const hw =
            lx > 0
              ? chunk.columns[lz * 16 + lx - 1].height
              : (height(cx - 1, cz, 15, lz) ?? h);
          const wx = cx * 16 + lx;
          const wz = cz * 16 + lz;
          const argb = papyrus(col.color, h, hn, hw, col.waterDepth, wx, wz);
          const px = lcx * 16 + lx;
          const pz = lcz * 16 + lz;
          // RGBA byte order
          view.setUint32(
            (pz * TILE_SIZE + px) * 4,
            (((argb & 0x00ffffff) << 8) | 0xff) >>> 0,
            false,
          );
        }
      }
    }
  }
  return encodePng(rgba, TILE_SIZE, TILE_SIZE);
}
