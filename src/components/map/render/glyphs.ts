export type Glyph = { x: number; z: number; variant: number };

/** Small deterministic integer hash: the same inputs always give the same 32-bit number. */
export function hash(a: number, b: number, seed: number): number {
  let h =
    (Math.imul(a | 0, 0x27d4eb2d) ^
      Math.imul(b | 0, 0x165667b1) ^
      Math.imul(seed | 0, 0x9e3779b1)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Scatters decorations (trees, peaks, houses) over an area: one per grid cell of `spacing` blocks,
 * nudged inside its cell. The grid is global, so a glyph sits at the same block whichever window of
 * the map is being drawn, and a redraw or a neighbouring region never moves it.
 */
export function placeGlyphs(
  inside: (x: number, z: number) => boolean,
  window: { x: number; z: number; w: number; h: number },
  spacing: number,
  seed: number,
): Glyph[] {
  const out: Glyph[] = [];
  const i0 = Math.floor(window.x / spacing);
  const i1 = Math.floor((window.x + window.w) / spacing);
  const j0 = Math.floor(window.z / spacing);
  const j1 = Math.floor((window.z + window.h) / spacing);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const h = hash(i, j, seed);
      const x = (i + 0.15 + 0.7 * ((h & 0xffff) / 0xffff)) * spacing;
      const z = (j + 0.15 + 0.7 * (((h >>> 16) & 0xffff) / 0xffff)) * spacing;
      if (
        x < window.x ||
        z < window.z ||
        x >= window.x + window.w ||
        z >= window.z + window.h
      )
        continue;
      if (!inside(x, z)) continue;
      out.push({ x, z, variant: (h >>> 8) % 3 });
    }
  }
  return out;
}
