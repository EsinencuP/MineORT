import type { AreaName, Layer, Poly } from "@/lib/map/vectorize";
import { placeGlyphs } from "./glyphs";

/** Pixels per block of a region bitmap. */
export const REGION_SCALE = 2;
const SIDE = 512;

export const INK = "#3a3026";
const PARCHMENT_WASH: Record<string, string> = {
  swamp: "rgba(122,140,92,0.38)",
  sand: "rgba(226,203,140,0.55)",
  farmland: "rgba(196,176,110,0.35)",
  forest: "rgba(128,158,98,0.42)",
  snow: "rgba(255,255,255,0.75)",
  ice: "rgba(196,224,236,0.75)",
  stone: "rgba(150,140,128,0.38)",
  built: "rgba(184,140,100,0.45)",
  lava: "rgba(214,110,50,0.7)",
};
const WATER_WASH = "rgba(150,185,196,0.62)";
const DEEP_WASH = "rgba(104,150,170,0.55)";
const WASH_ORDER = [
  "swamp",
  "sand",
  "farmland",
  "forest",
  "snow",
  "ice",
  "stone",
  "built",
  "lava",
] as const;

function tracePath(
  ctx: CanvasRenderingContext2D,
  polys: Poly[],
  close: boolean,
) {
  ctx.beginPath();
  for (const p of polys) {
    if (p.length < 4) continue;
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    if (close) ctx.closePath();
  }
}

/** Alpha of a region-sized mask of the area, one pixel per block. */
function rasterMask(rings: Poly[]): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = c.height = SIDE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  tracePath(ctx, rings, true);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  const data = ctx.getImageData(0, 0, SIDE, SIDE).data;
  const alpha = new Uint8ClampedArray(SIDE * SIDE);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

function glyphsOf(
  layer: Layer,
  name: AreaName,
  spacing: number,
  seed: number,
  draw: (
    ctx: CanvasRenderingContext2D,
    x: number,
    z: number,
    v: number,
  ) => void,
  ctx: CanvasRenderingContext2D,
) {
  const rings = layer.areas[name].rings;
  if (!rings.length) return;
  const mask = rasterMask(rings);
  const at = (x: number, z: number) =>
    mask[Math.floor(z) * SIDE + Math.floor(x)] > 127;
  // positions come from a world-global grid, so they are the same in every region's bitmap
  const ox = layer.rx * SIDE;
  const oz = layer.rz * SIDE;
  const found = placeGlyphs(
    (x, z) => at(x - ox, z - oz),
    { x: ox, z: oz, w: SIDE, h: SIDE },
    spacing,
    seed,
  );
  for (const g of found) draw(ctx, g.x - ox, g.z - oz, g.variant);
}

function tree(ctx: CanvasRenderingContext2D, x: number, z: number, v: number) {
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = INK;
  ctx.fillStyle = v === 1 ? "rgba(96,128,80,0.85)" : "rgba(120,150,92,0.85)";
  ctx.beginPath();
  if (v === 2) {
    // conifer
    ctx.moveTo(x, z - 3.2);
    ctx.lineTo(x + 1.5, z + 0.6);
    ctx.lineTo(x - 1.5, z + 0.6);
    ctx.closePath();
  } else {
    // round crown
    ctx.arc(x, z - 1.4, v === 1 ? 1.7 : 1.4, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, z + 0.6);
  ctx.lineTo(x, z + 1.6);
  ctx.stroke();
}

function peak(ctx: CanvasRenderingContext2D, x: number, z: number, v: number) {
  const h = 4 + v;
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = INK;
  ctx.fillStyle = "rgba(222,214,200,0.9)";
  ctx.beginPath();
  ctx.moveTo(x - h * 0.9, z + h * 0.45);
  ctx.lineTo(x, z - h * 0.6);
  ctx.lineTo(x + h * 0.9, z + h * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // shaded side
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) {
    ctx.moveTo(x + k * 0.5, z - h * 0.6 + k * 0.9);
    ctx.lineTo(x + k * 0.9 + 0.4, z + h * 0.45 - 0.2);
  }
  ctx.stroke();
}

function house(ctx: CanvasRenderingContext2D, x: number, z: number, v: number) {
  const w = 2.2 + v * 0.3;
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = INK;
  ctx.fillStyle = "rgba(246,232,206,0.95)";
  ctx.fillRect(x - w / 2, z - 0.6, w, 1.7);
  ctx.strokeRect(x - w / 2, z - 0.6, w, 1.7);
  ctx.fillStyle = "rgba(168,84,60,0.9)";
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 0.3, z - 0.6);
  ctx.lineTo(x, z - 2);
  ctx.lineTo(x + w / 2 + 0.3, z - 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function stipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  z: number,
  v: number,
) {
  ctx.fillStyle = "rgba(120,96,50,0.7)";
  ctx.beginPath();
  ctx.arc(x, z, 0.28 + v * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function tuft(ctx: CanvasRenderingContext2D, x: number, z: number) {
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = "rgba(70,90,52,0.9)";
  ctx.beginPath();
  for (const d of [-0.7, 0, 0.7]) {
    ctx.moveTo(x + d, z + 0.8);
    ctx.lineTo(x + d * 1.4, z - 0.9);
  }
  ctx.stroke();
}

/** Draws a region's layer onto a transparent bitmap, in the style of an inked and washed map. */
export function drawRegion(layer: Layer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE * REGION_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(REGION_SCALE, REGION_SCALE);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // washes of colour under the ink
  for (const name of WASH_ORDER) {
    const rings = layer.areas[name].rings;
    if (!rings.length) continue;
    tracePath(ctx, rings, true);
    ctx.fillStyle = PARCHMENT_WASH[name];
    ctx.fill("evenodd");
  }

  // water: a wash, shading that deepens toward the middle, and fine hatching
  const water = layer.areas.water;
  if (water.rings.length) {
    tracePath(ctx, water.rings, true);
    ctx.fillStyle = WATER_WASH;
    ctx.fill("evenodd");
    ctx.save();
    tracePath(ctx, water.rings, true);
    ctx.clip("evenodd");
    const deep = layer.areas.deepWater.rings;
    if (deep.length) {
      tracePath(ctx, deep, true);
      ctx.fillStyle = DEEP_WASH;
      ctx.fill("evenodd");
    }
    // soft bands that hug the shore
    tracePath(ctx, water.strokes, false);
    for (const [w, a] of [
      [7, 0.05],
      [4.5, 0.07],
      [2.4, 0.1],
    ] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = `rgba(250,244,226,${a * 4})`;
      ctx.stroke();
    }
    // hatching
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = "rgba(58,86,104,0.32)";
    ctx.beginPath();
    for (let z = 1; z < SIDE; z += 3) {
      ctx.moveTo(0, z);
      ctx.lineTo(SIDE, z);
    }
    ctx.stroke();
    ctx.restore();
  }

  const farm = layer.areas.farmland.rings;
  if (farm.length) {
    ctx.save();
    tracePath(ctx, farm, true);
    ctx.clip("evenodd");
    ctx.lineWidth = 0.2;
    ctx.strokeStyle = "rgba(120,96,50,0.45)";
    ctx.beginPath();
    for (let z = 0; z < SIDE; z += 1.6) {
      ctx.moveTo(0, z);
      ctx.lineTo(SIDE, z);
    }
    ctx.stroke();
    ctx.restore();
  }

  // height contours
  for (const c of layer.contours) {
    const major = c.level % 32 === 0;
    ctx.lineWidth = major ? 0.5 : 0.28;
    ctx.strokeStyle = major ? "rgba(120,84,52,0.55)" : "rgba(120,84,52,0.3)";
    tracePath(ctx, c.lines, false);
    ctx.stroke();
  }

  // outlines of the land and water
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.85;
  tracePath(ctx, water.strokes, false);
  ctx.stroke();
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = "rgba(58,48,38,0.6)";
  for (const name of ["sand", "stone", "snow", "lava", "swamp"] as const) {
    tracePath(ctx, layer.areas[name].strokes, false);
    ctx.stroke();
  }

  // tracks
  ctx.setLineDash([2.4, 2]);
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = "rgba(110,76,44,0.9)";
  tracePath(ctx, layer.paths, false);
  ctx.stroke();
  ctx.setLineDash([]);

  // pictures
  glyphsOf(layer, "sand", 4, 5, stipple, ctx);
  glyphsOf(layer, "swamp", 6, 9, (c, x, z) => tuft(c, x, z), ctx);
  glyphsOf(layer, "stone", 13, 7, peak, ctx);
  glyphsOf(layer, "forest", 6.5, 3, tree, ctx);
  glyphsOf(layer, "built", 5, 13, house, ctx);
  return canvas;
}
