// Ported from AtlasMap by erkinpaw (MIT, https://github.com/erkinpaw/atlasmap):
// ChunkScanner.papyrus(), which turns a vanilla map colour into the muted, inked papyrus palette.
// Copyright (c) 2026 erkinpaw. See public/map/ATLASMAP-LICENSE.txt.

const PARCH_R = 234;
const PARCH_G = 216;
const PARCH_B = 174;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const band = (h: number) => Math.floor(h / 8);

/**
 * The colour of one block column as 0xFFRRGGBB.
 * `rgb` is the vanilla map colour, `h` the column's surface height, `hn` the height of the column to
 * the north and `hw` the one to the west (they give the slope shading and the contour lines),
 * `waterDepth` the water above the sea floor (0 on land), `wx` / `wz` the world position of the
 * column (they place the wave hatching).
 */
export function papyrus(
  rgb: number,
  h: number,
  hn: number,
  hw: number,
  waterDepth: number,
  wx: number,
  wz: number,
): number {
  let r: number;
  let g: number;
  let b: number;
  if (waterDepth > 0) {
    const t = Math.min(waterDepth, 14) / 14;
    r = lerp(120, 62, t);
    g = lerp(160, 98, t);
    b = lerp(164, 114, t);
    // engraved wave hatching
    if ((wz & 3) === 0 && ((wx + (wz >> 2) * 5) & 7) < 3) {
      r *= 0.88;
      g *= 0.88;
      b *= 0.9;
    }
  } else {
    r = (rgb >> 16) & 0xff;
    g = (rgb >> 8) & 0xff;
    b = rgb & 0xff;
    let shade = 1 + Math.max(-4, Math.min(4, h - hn)) * 0.045;
    if (h === hn) shade = 0.97;
    r *= shade;
    g *= shade;
    b *= shade;
    // sepia toning
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = lerp(r, l * 1.02 + 28, 0.42);
    g = lerp(g, l * 0.9 + 16, 0.42);
    b = lerp(b, l * 0.68 + 4, 0.42);
    // contour lines every 8 blocks
    if (band(h) !== band(hn) || band(h) !== band(hw)) {
      r *= 0.84;
      g *= 0.82;
      b *= 0.8;
    }
  }
  // soak into the parchment
  r = lerp(r, PARCH_R, 0.14);
  g = lerp(g, PARCH_G, 0.14);
  b = lerp(b, PARCH_B, 0.14);
  return (0xff000000 | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)) >>> 0;
}
