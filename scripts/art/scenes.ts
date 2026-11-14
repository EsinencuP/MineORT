import { Vox, noise2, rng } from "./engine.ts";

// Brand palette from the reference board: grass #6BAF5D, dirt #B57A4E, cream #F5E6D3, sky #A7D8FF.
export const P = {
  grass: ["#6BAF5D", "#74B866", "#62A556"],
  dirt: "#B57A4E",
  dirt2: "#A56C44",
  stone: "#9AA0A8",
  stone2: "#868C94",
  dark: "#4A4C55",
  sand: "#E6D6A0",
  water: "#5DB6EE",
  water2: "#74C4F3",
  leaf: ["#4F9B45", "#5FAE50", "#3F8A3B"],
  log: "#7B5232",
  plank: "#C4915A",
  plank2: "#B07F4B",
  roof: "#8A4A38",
  snow: "#F4F8FB",
  ice: "#B9E0F4",
  pink: ["#F4A9C4", "#F9C4D8", "#EE92B3"],
  lava: "#FF8A1E",
  lava2: "#FFB43C",
  wheat: ["#E8CB4E", "#F0D96A", "#D9B93C"],
  skin: "#E3B08D",
  hair: "#5B3A24",
  shirt: "#2FA4B5",
  cape: "#C0392B",
  white: "#F6F6F2",
  glow: "#FFD66B",
  slime: ["#6DC25A", "#7BCF68", "#4E9A42"],
};

const pick = <T>(r: () => number, a: readonly T[]) =>
  a[Math.floor(r() * a.length) % a.length];

export function grassCell(
  v: Vox,
  x: number,
  y: number,
  z: number,
  r: () => number,
) {
  v.set(x, y, z, r() > 0.5 ? P.dirt : P.dirt2, pick(r, P.grass));
}

/** Fills columns from 0 up to the height function; water fills up to `water` where terrain is lower. */
export function terrain(
  v: Vox,
  w: number,
  d: number,
  height: (x: number, y: number) => number,
  opts: { water?: number; seed?: number; sandNearWater?: boolean } = {},
) {
  const r = rng(opts.seed ?? 3);
  const wl = opts.water ?? 0;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < d; y++) {
      const h = Math.max(1, Math.round(height(x, y)));
      for (let z = 0; z < h - 1; z++)
        v.set(x, y, z, z < h - 3 ? P.stone2 : r() > 0.5 ? P.dirt : P.dirt2);
      if (opts.sandNearWater && h <= wl + 1) v.set(x, y, h - 1, P.sand);
      else grassCell(v, x, y, h - 1, r);
      for (let z = h; z < wl; z++)
        v.set(x, y, z, r() > 0.5 ? P.water : P.water2);
    }
}

export function topZ(v: Vox, x: number, y: number, from = 40): number {
  for (let z = from; z >= 0; z--) if (v.has(x, y, z)) return z + 1;
  return 0;
}

export function tree(
  v: Vox,
  x: number,
  y: number,
  z: number,
  h = 4,
  leaves: readonly string[] = P.leaf,
  r: () => number = Math.random,
) {
  v.column(x, y, z, z + h, P.log);
  const top = z + h;
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
      v.set(x + dx, y + dy, top - 1, pick(r, leaves));
      v.set(x + dx, y + dy, top, pick(r, leaves));
    }
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      v.set(x + dx, y + dy, top + 1, pick(r, leaves));
  v.set(x, y, top + 2, pick(r, leaves));
  v.set(x - 1, y, top + 2, pick(r, leaves));
  v.set(x + 1, y, top + 2, pick(r, leaves));
  v.set(x, y - 1, top + 2, pick(r, leaves));
  v.set(x, y + 1, top + 2, pick(r, leaves));
}

export function pine(
  v: Vox,
  x: number,
  y: number,
  z: number,
  h = 6,
  snowy = false,
) {
  v.column(x, y, z, z + 2, P.log);
  const green = snowy ? "#3F7F4F" : "#3E8A4A";
  let radius = 2;
  for (let layer = 0; layer < h; layer++) {
    const zz = z + 2 + layer;
    const rad = layer % 2 === 0 ? radius : Math.max(0, radius - 1);
    for (let dx = -rad; dx <= rad; dx++)
      for (let dy = -rad; dy <= rad; dy++) {
        if (Math.abs(dx) + Math.abs(dy) > rad + 1) continue;
        v.set(x + dx, y + dy, zz, snowy && layer % 2 === 1 ? P.snow : green);
      }
    if (layer % 2 === 1 && radius > 0) radius -= 1;
  }
  v.set(x, y, z + 2 + h, snowy ? P.snow : green);
}

export function castle(v: Vox, x: number, y: number, z: number) {
  const wall = "#C9CDD3";
  const wall2 = "#B5BAC2";
  v.box(x, y, z, 9, 7, 4, wall);
  v.box(x + 1, y + 1, z + 4, 7, 5, 1, wall2);
  for (const [tx, ty] of [
    [x - 1, y - 1],
    [x + 8, y - 1],
    [x - 1, y + 6],
    [x + 8, y + 6],
  ] as const) {
    v.box(tx, ty, z, 2, 2, 7, wall);
    v.box(tx, ty, z + 7, 2, 2, 1, "#A9544A");
    v.box(tx, ty, z + 8, 1, 1, 1, "#A9544A");
  }
  v.box(x + 3, y + 2, z + 4, 3, 3, 6, wall);
  v.box(x + 2, y + 1, z + 10, 5, 5, 1, "#A9544A");
  v.box(x + 3, y + 2, z + 11, 3, 3, 1, "#A9544A");
  v.box(x + 4, y + 3, z + 12, 1, 1, 1, "#A9544A");
  v.column(x + 4, y + 3, z + 13, z + 17, P.log);
  v.box(x + 5, y + 3, z + 15, 2, 1, 2, P.cape);
  // door and windows (visible on the +y and +x faces)
  v.box(x + 3, y + 7 - 1, z + 1, 2, 1, 2, P.log);
  v.set(x + 8 - 1, y + 3, z + 2, P.glow);
}

export function seatedBuilder(v: Vox, x: number, y: number, z: number) {
  // legs stretch toward -x (the view direction), back faces +x
  v.box(x - 1, y, z, 2, 1, 1, "#3B4C7A");
  v.box(x - 1, y + 1, z, 2, 1, 1, "#3B4C7A");
  v.box(x - 1, y, z, 1, 2, 1, "#2D3A5E");
  v.box(x, y, z + 1, 1, 2, 3, P.shirt);
  v.box(x + 1, y, z + 1, 1, 2, 3, P.cape); // cape on the back
  v.box(x + 1, y, z + 4, 1, 2, 1, P.cape);
  v.box(x - 1, y - 1, z + 2, 1, 1, 2, P.skin); // arms resting
  v.box(x - 1, y + 2, z + 2, 1, 1, 2, P.skin);
  v.box(x, y, z + 4, 2, 2, 2, P.skin);
  v.box(x, y, z + 6 - 0, 2, 2, 1, P.hair);
  v.box(x + 1, y, z + 4, 1, 2, 2, P.hair);
}

export function dog(v: Vox, x: number, y: number, z: number) {
  v.box(x, y, z + 1, 2, 1, 1, P.white);
  v.box(x - 1, y, z + 2, 1, 1, 1, P.white);
  v.set(x - 2, y, z + 2, P.white);
  v.set(x - 1, y, z + 3, "#CFCFC9");
  v.set(x + 1, y, z + 2, "#CFCFC9");
  v.set(x, y, z, P.white);
  v.set(x + 1, y, z, P.white);
  v.set(x + 2, y, z + 1, P.white);
}

export function cloud(
  v: Vox,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  seed = 1,
) {
  const r = rng(seed);
  for (let i = 0; i < w; i++)
    for (let j = 0; j < d; j++) {
      const edge = Math.min(i, w - 1 - i, j, d - 1 - j);
      if (edge === 0 && r() > 0.55) continue;
      v.set(x + i, y + j, z, P.white);
      if (edge >= 1 && r() > 0.45) v.set(x + i, y + j, z + 1, P.white);
    }
}

export function house(v: Vox, x: number, y: number, z: number) {
  v.box(x, y, z, 7, 6, 4, P.plank);
  v.box(x, y, z, 7, 6, 1, P.log);
  for (const cx of [x, x + 6])
    for (const cy of [y, y + 5]) v.box(cx, cy, z, 1, 1, 4, P.log);
  // roof
  for (let i = 0; i < 4; i++)
    v.box(
      x - 1 + i,
      y - 1 + i,
      z + 4 + i,
      9 - 2 * i,
      8 - 2 * i,
      1,
      i % 2 ? "#9A5440" : P.roof,
    );
  // door (+y face) and glowing windows
  v.box(x + 2, y + 5, z + 1, 2, 1, 2, "#6B4426");
  v.set(x + 5, y + 5, z + 2, P.glow);
  v.set(x + 6, y + 3, z + 2, P.glow);
  v.set(x + 6, y + 1, z + 2, P.glow);
}

export function lantern(v: Vox, x: number, y: number, z: number) {
  v.column(x, y, z, z + 4, P.log);
  v.box(x, y, z + 4, 1, 1, 1, "#3A3A42");
  v.set(x, y, z + 5, P.glow);
  v.box(x, y, z + 6, 1, 1, 1, "#3A3A42");
}

export function fence(
  v: Vox,
  x0: number,
  y0: number,
  w: number,
  d: number,
  z: number,
) {
  for (let i = 0; i < w; i++)
    for (const y of [y0, y0 + d - 1])
      v.set(x0 + i, y, z, i % 2 ? P.plank2 : P.log);
  for (let j = 0; j < d; j++)
    for (const x of [x0, x0 + w - 1])
      v.set(x, y0 + j, z, j % 2 ? P.plank2 : P.log);
}

export function windmill(v: Vox, x: number, y: number, z: number) {
  v.box(x, y, z, 5, 5, 3, P.plank);
  v.box(x + 1, y + 1, z + 3, 3, 3, 4, P.plank);
  v.box(x, y, z + 7 - 4, 5, 5, 1, P.plank2);
  v.box(x - 0, y, z + 7, 5, 5, 1, P.roof);
  v.box(x + 1, y + 1, z + 8, 3, 3, 1, P.roof);
  v.set(x + 2, y + 2, z + 9, P.roof);
  v.box(x + 2, y + 5, z + 1, 1, 1, 2, "#6B4426");
  // blades on the +y face
  const cy = y + 5;
  const cz = z + 6;
  v.box(x + 2, cy, cz - 5, 1, 1, 11, P.white);
  v.box(x - 3, cy, cz, 11, 1, 1, P.white);
  for (let i = 1; i <= 4; i++) {
    v.set(x + 2 - i, cy, cz + 1 + i - (i > 2 ? 0 : 0), "#E8E8E2");
    v.set(x + 2 + i, cy, cz - 1 - i, "#E8E8E2");
  }
  v.box(x + 2, cy, cz, 1, 1, 1, P.log);
}

export function flowers(
  v: Vox,
  w: number,
  d: number,
  count: number,
  seed = 5,
  minZ = 1,
) {
  const r = rng(seed);
  const cols = ["#FFFFFF", "#F5D547", "#E96B8A", "#FFFFFF"];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * d);
    const z = topZ(v, x, y);
    const below = v.get(x, y, z - 1);
    if (!below?.g || z < minZ) continue;
    v.set(x, y, z, pick(r, cols));
  }
}

// ---------------------------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------------------------

export function heroScene() {
  const v = new Vox();
  const N = 40;
  const D = 34;
  const n = noise2(11);
  const r = rng(21);
  const river = (x: number, y: number) =>
    Math.abs(x - (16 + Math.sin(y / 3.2) * 2.2));
  terrain(
    v,
    N,
    D,
    (x, y) => {
      let h = 7 + Math.floor(n(x / 5, y / 5) * 2.4);
      const pr = Math.hypot(x - 29, y - 22);
      if (pr < 6.5) h = 15;
      else if (pr < 8.2) h = 12;
      else if (pr < 10.5) h = Math.max(h, 9);
      const hr = Math.hypot(x - 9, y - 9);
      if (hr < 4) h = 13;
      else if (hr < 6.5) h = Math.max(h, 11);
      else if (hr < 9.5) h = Math.max(h, 9);
      if (y > 11 && river(x, y) < 1.8 && pr > 9.5) h = 4;
      return h;
    },
    { water: 6, seed: 4, sandNearWater: true },
  );
  // waterfall pouring from the plateau into the river
  for (let z = 5; z < 15; z++)
    for (const [x, y] of [
      [22, 21],
      [22, 22],
      [21, 21],
    ] as const) {
      v.set(x, y, z, z % 2 ? P.water2 : P.water);
    }
  castle(v, 5, 5, topZ(v, 9, 9));
  for (let i = 0; i < 30; i++) {
    const x = 1 + Math.floor(r() * (N - 2));
    const y = 1 + Math.floor(r() * (D - 2));
    const z = topZ(v, x, y);
    const g = v.get(x, y, z - 1);
    if (!g?.g || v.has(x, y, z)) continue;
    if (Math.hypot(x - 9, y - 9) < 6 || Math.hypot(x - 30, y - 24) < 4)
      continue;
    if (y > 9 && river(x, y) < 3 && Math.hypot(x - 29, y - 22) > 9) continue;
    tree(v, x, y, z, 3 + Math.floor(r() * 3), P.leaf, r);
  }
  // big tree on the cliff edge
  tree(v, 35, 14, topZ(v, 35, 14), 7, P.leaf, r);
  seatedBuilder(v, 31, 25, topZ(v, 31, 25));
  dog(v, 32, 28, topZ(v, 32, 28));
  flowers(v, N, D, 45, 9, 8);
  return v;
}

export function cloudsScene(seed = 4) {
  const v = new Vox();
  cloud(v, 0, 0, 0, 9, 5, seed);
  cloud(v, 12, 3, 1, 6, 4, seed + 1);
  cloud(v, 4, 8, 0, 7, 4, seed + 2);
  return v;
}

export function houseScene() {
  const v = new Vox();
  const r = rng(14);
  terrain(v, 22, 18, () => 3, { seed: 2 });
  house(v, 4, 3, 3);
  lantern(v, 12, 9, 3);
  fence(v, 2, 1, 14, 13, 3);
  v.del(10, 14, 3);
  v.del(9, 14, 3);
  for (let x = 6; x <= 10; x++)
    for (let y = 9; y <= 13; y++)
      if ((x + y) % 2 === 0 || y > 11) v.set(x, y, 2, P.sand);
  tree(v, 18, 4, 3, 4, P.leaf, r);
  tree(v, 19, 11, 3, 3, P.leaf, r);
  flowers(v, 22, 18, 90, 6, 3);
  return v;
}

export function slimeScene() {
  const v = new Vox();
  terrain(v, 16, 16, () => 3, { seed: 8 });
  v.box(4, 4, 3, 7, 7, 7, P.slime[0]);
  for (let x = 4; x < 11; x++)
    for (let z = 3; z < 10; z++) {
      v.set(x, 10, z, (x + z) % 2 ? P.slime[1] : P.slime[0]);
    }
  // friendly face on the +y side
  const dark = "#25402A";
  for (const x of [5, 6, 8, 9]) for (const z of [6, 7]) v.set(x, 10, z, dark);
  for (const x of [6, 7, 8]) v.set(x, 10, 4, dark);
  v.set(5, 10, 5, dark);
  v.set(9, 10, 5, dark);
  // outline cubes
  v.box(4, 4, 3, 7, 7, 1, P.slime[2]);
  return v;
}

export function meadowScene() {
  const v = new Vox();
  const r = rng(31);
  terrain(
    v,
    26,
    22,
    (x, y) => 3 + (x > 15 ? 0 : 0) + (Math.hypot(x - 13, y - 9) < 4 ? 1 : 0),
    { seed: 12 },
  );
  for (let x = 0; x < 26; x++)
    for (let y = 0; y < 22; y++) {
      const z = topZ(v, x, y);
      if (z > 0 && Math.hypot(x - 13, y - 9) > 4.2 && r() > 0.12) {
        v.set(x, y, z - 1, pick(r, P.wheat));
        v.set(x, y, z, pick(r, P.wheat));
      }
    }
  windmill(v, 11, 7, topZ(v, 12, 9));
  tree(v, 3, 3, topZ(v, 3, 3), 4, P.leaf, r);
  tree(v, 23, 18, topZ(v, 23, 18), 3, P.leaf, r);
  flowers(v, 26, 22, 70, 4, 3);
  return v;
}

export function snowScene() {
  const v = new Vox();
  const r = rng(41);
  const n = noise2(5);
  for (let x = 0; x < 26; x++)
    for (let y = 0; y < 22; y++) {
      const peak = (cx: number, cy: number, h: number, rad: number) =>
        Math.max(0, h - Math.hypot(x - cx, y - cy) * (h / rad));
      const h =
        3 + Math.max(peak(8, 6, 13, 9), peak(17, 10, 10, 8), peak(5, 15, 6, 6));
      const top = Math.round(h + n(x / 3, y / 3));
      for (let z = 0; z < top; z++)
        v.set(x, y, z, z > top - 4 ? P.snow : z > 5 ? "#7C889B" : P.ice);
      v.set(x, y, top, top > 6 ? P.snow : P.ice);
    }
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 26);
    const y = 12 + Math.floor(r() * 9);
    const z = topZ(v, x, y);
    if (z < 5) pine(v, x, y, z, 5, true);
  }
  return v;
}

export function cherryScene() {
  const v = new Vox();
  const r = rng(51);
  terrain(v, 24, 20, (x, y) => (Math.hypot(x - 12, y - 9) < 6.5 ? 4 : 2), {
    water: 3,
    seed: 13,
    sandNearWater: true,
  });
  const z0 = topZ(v, 12, 9);
  v.column(12, 9, z0, z0 + 6, P.log);
  v.column(13, 9, z0 + 3, z0 + 5, P.log);
  v.column(11, 9, z0 + 3, z0 + 5, P.log);
  for (let dx = -4; dx <= 4; dx++)
    for (let dy = -4; dy <= 4; dy++)
      for (let dz = 0; dz <= 3; dz++) {
        if (Math.hypot(dx, dy, (dz - 1.2) * 1.5) > 4.3 || r() < 0.1) continue;
        v.set(12 + dx, 9 + dy, z0 + 5 + dz, pick(r, P.pink));
      }
  for (let i = 0; i < 50; i++) {
    const x = Math.floor(r() * 24);
    const y = Math.floor(r() * 20);
    const z = topZ(v, x, y);
    if (v.get(x, y, z - 1)?.g && !v.has(x, y, z))
      v.set(x, y, z, r() > 0.5 ? P.pink[1] : P.pink[0]);
  }
  return v;
}

export function lavaScene() {
  const v = new Vox();
  const r = rng(61);
  const n = noise2(9);
  for (let x = 0; x < 22; x++)
    for (let y = 0; y < 20; y++) {
      const h = 6 + Math.floor(n(x / 3, y / 3) * 3);
      for (let z = 0; z < h; z++) v.set(x, y, z, r() > 0.6 ? P.stone2 : P.dark);
      const chan = Math.abs(x - 11 + Math.sin(y / 2.5) * 3) < 1.6;
      if (chan) {
        v.del(x, y, h - 1);
        v.set(x, y, h - 2, r() > 0.5 ? P.lava : P.lava2);
      }
    }
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(r() * 22);
    const y = Math.floor(r() * 20);
    const z = topZ(v, x, y);
    if (v.get(x, y, z - 1)?.c !== P.lava && v.get(x, y, z - 1)?.c !== P.lava2)
      v.set(x, y, z, r() > 0.7 ? "#E36A12" : P.dark);
  }
  return v;
}

export function landscapeScene() {
  const v = new Vox();
  const r = rng(71);
  const n = noise2(17);
  const W = 64;
  const D = 22;
  for (let x = 0; x < W; x++)
    for (let y = 0; y < D; y++) {
      const m = (cx: number, h: number, rad: number) =>
        Math.max(0, h - Math.abs(x - cx) * (h / rad) - Math.abs(y - 4) * 0.8);
      const mount = Math.max(m(14, 15, 14), m(36, 19, 17), m(54, 12, 11));
      const base = 3 + Math.floor(n(x / 6, y / 6) * 2.2);
      const h = Math.max(base, Math.round(base + mount));
      for (let z = 0; z < h - 1; z++)
        v.set(
          x,
          y,
          z,
          h > 10 && z > h - 5 ? (h > 14 ? P.snow : P.stone) : P.dirt,
        );
      if (h > 14) v.set(x, y, h - 1, P.snow);
      else if (h > 9) v.set(x, y, h - 1, P.stone);
      else grassCell(v, x, y, h - 1, r);
    }
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * W);
    const y = 8 + Math.floor(r() * 13);
    const z = topZ(v, x, y);
    if (v.get(x, y, z - 1)?.g)
      tree(v, x, y, z, 3 + Math.floor(r() * 3), P.leaf, r);
  }
  return v;
}

export function leavesScene() {
  const v = new Vox();
  const r = rng(81);
  for (let x = 0; x < 9; x++)
    for (let y = 0; y < 9; y++)
      for (let z = 0; z < 4; z++)
        if (Math.hypot(x - 4, y - 4, (z - 1) * 1.6) < 4.6 && r() > 0.12)
          v.set(x, y, z, pick(r, P.leaf));
  return v;
}

export function cubeScene() {
  const v = new Vox();
  v.set(0, 0, 0, P.dirt, P.grass[0]);
  return v;
}
