// Tiny isometric voxel renderer that outputs flat-shaded SVG. All art in /public/art is generated
// with it: original work, no third-party game assets involved (no licence or brand risk).

export type Cell = {
  c: string; // base colour
  g?: string; // grass fringe colour for the upper part of the side faces
};

const OFF = 96;
const K = 256;
const key = (x: number, y: number, z: number) =>
  ((x + OFF) * K + (y + OFF)) * K + (z + OFF);

export function hexToRgb(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
}
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * f, g * f, b * f);
}
/** Mix towards a colour (used for atmospheric haze and warm light). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [0,1]. */
export function noise2(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = sm(x - xi);
    const yf = sm(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export class Vox {
  cells = new Map<number, Cell>();
  set(x: number, y: number, z: number, c: string, g?: string) {
    this.cells.set(key(x, y, z), { c, g });
  }
  has(x: number, y: number, z: number) {
    return this.cells.has(key(x, y, z));
  }
  get(x: number, y: number, z: number) {
    return this.cells.get(key(x, y, z));
  }
  del(x: number, y: number, z: number) {
    this.cells.delete(key(x, y, z));
  }
  box(
    x0: number,
    y0: number,
    z0: number,
    w: number,
    d: number,
    h: number,
    c: string,
    g?: string,
  ) {
    for (let x = x0; x < x0 + w; x++)
      for (let y = y0; y < y0 + d; y++)
        for (let z = z0; z < z0 + h; z++) this.set(x, y, z, c, g);
  }
  /** Solid column from z0 up to (and including) top-1. */
  column(x: number, y: number, z0: number, top: number, c: string, g?: string) {
    for (let z = z0; z < top; z++) this.set(x, y, z, c, g);
  }
}

type Poly = { fill: string; pts: [number, number][] };

export type RenderOptions = {
  s?: number; // half tile width in px
  pad?: number;
  jitter?: number; // per-voxel brightness variation
  seed?: number;
  top?: number; // brightness factors
  left?: number;
  right?: number;
};

/** Cells are stored as [x,y,z]; iteration order is derived on render. */
export function render(
  v: Vox,
  o: RenderOptions = {},
): { svg: string; width: number; height: number } {
  const s = o.s ?? 8;
  const hw = s;
  const hh = s / 2;
  const hv = s; // vertical edge length
  const jit = o.jitter ?? 0.05;
  const kTop = o.top ?? 1;
  const kLeft = o.left ?? 0.82;
  const kRight = o.right ?? 0.66;
  const rand = rng(o.seed ?? 7);

  const px = (X: number, Y: number, Z: number): [number, number] => [
    (X - Y) * hw,
    (X + Y) * hh - Z * hv,
  ];

  const list: { x: number; y: number; z: number; cell: Cell }[] = [];
  for (const [k, cell] of v.cells) {
    const z = (k % K) - OFF;
    const y = (Math.floor(k / K) % K) - OFF;
    const x = Math.floor(k / (K * K)) - OFF;
    list.push({ x, y, z, cell });
  }
  list.sort(
    (a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.z - b.z || a.x - b.x,
  );

  const polys: Poly[] = [];
  for (const { x, y, z, cell } of list) {
    const j = 1 + (rand() - 0.5) * 2 * jit;
    const base = cell.c;
    if (!v.has(x + 1, y, z)) {
      // right face (X = x+1)
      const p = [
        px(x + 1, y, z),
        px(x + 1, y + 1, z),
        px(x + 1, y + 1, z + 1),
        px(x + 1, y, z + 1),
      ] as [number, number][];
      if (cell.g) {
        const cut = 0.3;
        const a = px(x + 1, y + 1, z + 1 - cut);
        const b = px(x + 1, y, z + 1 - cut);
        polys.push({ fill: shade(base, kRight * j), pts: [p[0], p[1], a, b] });
        polys.push({
          fill: shade(cell.g, kRight * j),
          pts: [b, a, p[2], p[3]],
        });
      } else polys.push({ fill: shade(base, kRight * j), pts: p });
    }
    if (!v.has(x, y + 1, z)) {
      // left face (Y = y+1)
      const p = [
        px(x, y + 1, z),
        px(x + 1, y + 1, z),
        px(x + 1, y + 1, z + 1),
        px(x, y + 1, z + 1),
      ] as [number, number][];
      if (cell.g) {
        const cut = 0.3;
        const a = px(x + 1, y + 1, z + 1 - cut);
        const b = px(x, y + 1, z + 1 - cut);
        polys.push({ fill: shade(base, kLeft * j), pts: [p[0], p[1], a, b] });
        polys.push({ fill: shade(cell.g, kLeft * j), pts: [b, a, p[2], p[3]] });
      } else polys.push({ fill: shade(base, kLeft * j), pts: p });
    }
    if (!v.has(x, y, z + 1)) {
      const top = cell.g ?? base;
      polys.push({
        fill: shade(top, kTop * j),
        pts: [
          px(x, y, z + 1),
          px(x + 1, y, z + 1),
          px(x + 1, y + 1, z + 1),
          px(x, y + 1, z + 1),
        ],
      });
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys) {
    for (const [x, y] of p.pts) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const pad = o.pad ?? 4;
  const width = Math.ceil(maxX - minX + pad * 2);
  const height = Math.ceil(maxY - minY + pad * 2);
  const f = (n: number) => (Math.round(n * 10) / 10).toString();

  // merge consecutive polygons of the same colour into one path (keeps the painter's order)
  const parts: string[] = [];
  let curFill = "";
  let cur: string[] = [];
  const flush = () => {
    if (cur.length)
      parts.push(
        `<path fill="${curFill}" stroke="${curFill}" d="${cur.join("")}"/>`,
      );
    cur = [];
  };
  for (const p of polys) {
    if (p.fill !== curFill) {
      flush();
      curFill = p.fill;
    }
    cur.push(
      "M" +
        p.pts
          .map(([x, y]) => `${f(x - minX + pad)} ${f(y - minY + pad)}`)
          .join("L") +
        "Z",
    );
  }
  flush();

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" stroke-width=".7" stroke-linejoin="round">` +
    parts.join("") +
    "</svg>";
  return { svg, width, height };
}
