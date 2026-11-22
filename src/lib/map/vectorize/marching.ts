import { chainSegments, type Chain, type Seg } from "./chain";

export const SIDE = 512;

/**
 * Marching squares over a SIDE x SIDE block grid. Block (x, z) covers [x, x+1] x [z, z+1] and its
 * value counts at its centre, so a contour runs along the block boundaries midway between a
 * filled and an empty block: the true shoreline, not an approximation of it.
 *
 * `value` says whether a block is inside the shape. `known` says whether the block is a real,
 * explored block; a piece of outline that touches an unknown block is part of the fill but is not
 * returned as a stroke, so the edge of the explored area never looks like a shore.
 * Blocks outside the grid are empty and unknown.
 */
export function marchingSquares(
  value: Uint8Array,
  known: Uint8Array,
): { fill: Chain[]; strokes: Chain[] } {
  const v = (x: number, z: number) =>
    x < 0 || z < 0 || x >= SIDE || z >= SIDE ? 0 : value[z * SIDE + x];
  const k = (x: number, z: number) =>
    x < 0 || z < 0 || x >= SIDE || z >= SIDE ? 0 : known[z * SIDE + x];

  const all: Seg[] = [];
  const solid: Seg[] = [];

  for (let j = -1; j < SIDE; j++) {
    for (let i = -1; i < SIDE; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i + 1, j + 1);
      const d = v(i, j + 1);
      const mask = a * 8 + b * 4 + c * 2 + d;
      if (mask === 0 || mask === 15) continue;

      const T: [number, number] = [i + 1, j + 0.5];
      const R: [number, number] = [i + 1.5, j + 1];
      const B: [number, number] = [i + 1, j + 1.5];
      const L: [number, number] = [i + 0.5, j + 1];
      const pairs: [[number, number], [number, number]][] = [];
      switch (mask) {
        case 1:
          pairs.push([L, B]);
          break;
        case 2:
          pairs.push([B, R]);
          break;
        case 3:
          pairs.push([L, R]);
          break;
        case 4:
          pairs.push([T, R]);
          break;
        case 5:
          pairs.push([T, R], [L, B]);
          break;
        case 6:
          pairs.push([T, B]);
          break;
        case 7:
          pairs.push([T, L]);
          break;
        case 8:
          pairs.push([T, L]);
          break;
        case 9:
          pairs.push([T, B]);
          break;
        case 10:
          pairs.push([T, L], [B, R]);
          break;
        case 11:
          pairs.push([T, R]);
          break;
        case 12:
          pairs.push([L, R]);
          break;
        case 13:
          pairs.push([B, R]);
          break;
        case 14:
          pairs.push([L, B]);
          break;
      }
      const strokeable =
        k(i, j) && k(i + 1, j) && k(i + 1, j + 1) && k(i, j + 1);
      for (const [p, q] of pairs) {
        const seg: Seg = [p[0], p[1], q[0], q[1]];
        all.push(seg);
        if (strokeable) solid.push(seg);
      }
    }
  }
  return { fill: chainSegments(all), strokes: chainSegments(solid) };
}
