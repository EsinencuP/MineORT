import { SURFACE, type ChunkColumns, type Surface } from "../chunk-codec";
import type { Chain } from "./chain";
import { marchingSquares, SIDE } from "./marching";
import { chaikin, round2, simplify } from "./smooth";
import { centreLines } from "./thin";

/** Flat [x0, z0, x1, z1, ...] in blocks from the region's north-west corner. */
export type Poly = number[];

export const AREAS = {
  water: [SURFACE.water, SURFACE.deep_water],
  deepWater: [SURFACE.deep_water],
  swamp: [SURFACE.swamp],
  sand: [SURFACE.sand],
  forest: [SURFACE.forest],
  snow: [SURFACE.snow],
  ice: [SURFACE.ice],
  stone: [SURFACE.stone],
  farmland: [SURFACE.farmland],
  built: [SURFACE.built],
  lava: [SURFACE.lava],
} as const satisfies Record<string, readonly Surface[]>;
export type AreaName = keyof typeof AREAS;

export type Layer = {
  v: 1;
  dim: string;
  rx: number;
  rz: number;
  /** 32 x 32 chunk bitmask, row by row (bit = cz * 32 + cx), least significant bit first. */
  explored: string;
  /** `rings` are filled shapes (even-odd); `strokes` are outlines drawn as shorelines or edges. */
  areas: Record<AreaName, { rings: Poly[]; strokes: Poly[] }>;
  contours: { level: number; lines: Poly[] }[];
  paths: Poly[];
};

const CONTOUR_STEP = 8;
const CONTOUR_FROM = 72;
const CONTOUR_TO = 320;
const SMOOTH_PASSES = 2;
const EPSILON = 0.3;

const finish = (c: Chain, closeStroke: boolean): Poly => {
  const smooth = chaikin(c.points, c.closed, SMOOTH_PASSES);
  const lean = simplify(smooth, c.closed, EPSILON);
  const out = round2(lean);
  // a closed outline drawn as a line needs its first point again at the end
  if (closeStroke && c.closed) out.push(out[0], out[1]);
  return out;
};

const rings = (chains: Chain[]) =>
  chains
    .filter((c) => c.closed && c.points.length >= 6)
    .map((c) => finish(c, false));
const lines = (chains: Chain[]) =>
  chains.filter((c) => c.points.length >= 4).map((c) => finish(c, true));

export function buildLayer(input: {
  dim: string;
  rx: number;
  rz: number;
  chunks: Map<string, ChunkColumns>;
}): Layer {
  const { dim, rx, rz, chunks } = input;
  const heights = new Int16Array(SIDE * SIDE);
  const surfaces = new Uint8Array(SIDE * SIDE);
  const known = new Uint8Array(SIDE * SIDE);
  const explored = Buffer.alloc(128);

  for (let lz = 0; lz < 32; lz++) {
    for (let lx = 0; lx < 32; lx++) {
      const chunk = chunks.get(`${rx * 32 + lx},${rz * 32 + lz}`);
      if (!chunk) continue;
      const bit = lz * 32 + lx;
      explored[bit >> 3] |= 1 << (bit & 7);
      chunk.columns.forEach((col, i) => {
        const at = (lz * 16 + Math.floor(i / 16)) * SIDE + lx * 16 + (i % 16);
        heights[at] = col.height;
        surfaces[at] = col.surface;
        known[at] = 1;
      });
    }
  }

  const areas = {} as Layer["areas"];
  const mask = new Uint8Array(SIDE * SIDE);
  for (const [name, kinds] of Object.entries(AREAS) as [
    AreaName,
    readonly Surface[],
  ][]) {
    let any = false;
    for (let i = 0; i < mask.length; i++) {
      mask[i] = known[i] && kinds.includes(surfaces[i] as Surface) ? 1 : 0;
      if (mask[i]) any = true;
    }
    if (!any) {
      areas[name] = { rings: [], strokes: [] };
      continue;
    }
    const { fill, strokes } = marchingSquares(mask, known);
    areas[name] = { rings: rings(fill), strokes: lines(strokes) };
  }

  // height contours run over dry, explored land only, so a shore is never drawn twice
  const land = new Uint8Array(SIDE * SIDE);
  let top = -Infinity;
  for (let i = 0; i < land.length; i++) {
    const s = surfaces[i];
    land[i] =
      known[i] &&
      s !== SURFACE.water &&
      s !== SURFACE.deep_water &&
      s !== SURFACE.lava
        ? 1
        : 0;
    if (land[i] && heights[i] > top) top = heights[i];
  }
  const contours: Layer["contours"] = [];
  for (
    let level = CONTOUR_FROM;
    level <= CONTOUR_TO && level <= top;
    level += CONTOUR_STEP
  ) {
    for (let i = 0; i < mask.length; i++)
      mask[i] = land[i] && heights[i] >= level ? 1 : 0;
    const { strokes } = marchingSquares(mask, land);
    const found = lines(strokes);
    if (found.length) contours.push({ level, lines: found });
  }

  for (let i = 0; i < mask.length; i++) {
    mask[i] = known[i] && surfaces[i] === SURFACE.path ? 1 : 0;
  }
  const paths = centreLines(mask)
    .filter((c) => c.points.length >= 6)
    .map((c) => round2(simplify(chaikin(c.points, false, 1), false, 0.5)));

  return {
    v: 1,
    dim,
    rx,
    rz,
    explored: explored.toString("base64"),
    areas,
    contours,
    paths,
  };
}
