import { chainSegments, type Chain, type Seg } from "./chain";
import { SIDE } from "./marching";

/** Zhang-Suen thinning: peels a mask down to a one-block-wide skeleton that keeps its shape. */
function thin(mask: Uint8Array): Uint8Array {
  const m = Uint8Array.from(mask);
  const at = (x: number, z: number) =>
    x < 0 || z < 0 || x >= SIDE || z >= SIDE ? 0 : m[z * SIDE + x];
  const drop: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      drop.length = 0;
      for (let z = 0; z < SIDE; z++) {
        for (let x = 0; x < SIDE; x++) {
          if (!m[z * SIDE + x]) continue;
          // neighbours clockwise from the one above
          const p = [
            at(x, z - 1),
            at(x + 1, z - 1),
            at(x + 1, z),
            at(x + 1, z + 1),
            at(x, z + 1),
            at(x - 1, z + 1),
            at(x - 1, z),
            at(x - 1, z - 1),
          ];
          const neighbours = p.reduce((a, b) => a + b, 0);
          if (neighbours < 2 || neighbours > 6) continue;
          let transitions = 0;
          for (let i = 0; i < 8; i++) {
            if (p[i] === 0 && p[(i + 1) % 8] === 1) transitions++;
          }
          if (transitions !== 1) continue;
          const [n, , e, , s, , w] = p;
          const ok =
            step === 0
              ? n * e * s === 0 && e * s * w === 0
              : n * e * w === 0 && n * s * w === 0;
          if (ok) drop.push(z * SIDE + x);
        }
      }
      if (drop.length) changed = true;
      for (const i of drop) m[i] = 0;
    }
  }
  return m;
}

/** Centre lines of a mask of track-like blocks, as open polylines through block centres. */
export function centreLines(mask: Uint8Array): Chain[] {
  const skeleton = thin(mask);
  const has = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < SIDE && z < SIDE && skeleton[z * SIDE + x] === 1;
  const segs: Seg[] = [];
  for (let z = 0; z < SIDE; z++) {
    for (let x = 0; x < SIDE; x++) {
      if (!has(x, z)) continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (has(x + 1, z)) segs.push([cx, cz, cx + 1, cz]);
      if (has(x, z + 1)) segs.push([cx, cz, cx, cz + 1]);
      // a diagonal joins two blocks only when no block beside them already links them
      if (has(x + 1, z + 1) && !has(x + 1, z) && !has(x, z + 1)) {
        segs.push([cx, cz, cx + 1, cz + 1]);
      }
      if (has(x - 1, z + 1) && !has(x - 1, z) && !has(x, z + 1)) {
        segs.push([cx, cz, cx - 1, cz + 1]);
      }
    }
  }
  return chainSegments(segs);
}
