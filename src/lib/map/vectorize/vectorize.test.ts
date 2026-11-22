import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  SURFACE,
  type ChunkColumns,
  type Column,
} from "../chunk-codec";
import { buildLayer, type Layer, type Poly } from ".";

type Cell = Pick<Column, "surface" | "height" | "waterDepth">;
const LAND: Cell = { surface: SURFACE.grass, height: 64, waterDepth: 0 };

/** A region made of whole chunks; `at` decides every block, `has` which chunks were explored. */
function world(
  at: (x: number, z: number) => Partial<Cell>,
  has: (cx: number, cz: number) => boolean = () => true,
) {
  const chunks = new Map<string, ChunkColumns>();
  for (let cz = 0; cz < 32; cz++) {
    for (let cx = 0; cx < 32; cx++) {
      if (!has(cx, cz)) continue;
      const columns: Column[] = [];
      for (let i = 0; i < COLUMNS; i++) {
        const x = cx * 16 + (i % 16);
        const z = cz * 16 + Math.floor(i / 16);
        columns.push({ ...LAND, ...at(x, z), biome: "minecraft:plains" });
      }
      chunks.set(`${cx},${cz}`, { columns });
    }
  }
  return chunks;
}

const layerOf = (chunks: Map<string, ChunkColumns>): Layer =>
  buildLayer({ dim: "overworld", rx: 0, rz: 0, chunks });

const dist = (x: number, z: number, cx: number, cz: number) =>
  Math.hypot(x - cx, z - cz);
const vertices = (p: Poly) => {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]);
  return out;
};
const inDisc = (cx: number, cz: number, r: number) => (x: number, z: number) =>
  dist(x + 0.5, z + 0.5, cx, cz) <= r;

describe("buildLayer geometry", () => {
  it("draws a round lake as one closed ring within one block of the true circle", () => {
    const lake = inDisc(256, 256, 20);
    const layer = layerOf(
      world((x, z) =>
        lake(x, z) ? { surface: SURFACE.water, waterDepth: 2 } : {},
      ),
    );
    expect(layer.areas.water.rings).toHaveLength(1);
    for (const [x, z] of vertices(layer.areas.water.rings[0])) {
      expect(Math.abs(dist(x, z, 256, 256) - 20)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a river two blocks wide as one continuous ring", () => {
    const layer = layerOf(
      world((x, z) =>
        z >= 100 && z <= 101 ? { surface: SURFACE.water, waterDepth: 1 } : {},
      ),
    );
    expect(layer.areas.water.rings).toHaveLength(1);
    const zs = vertices(layer.areas.water.rings[0]).map(([, z]) => z);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(99.5);
    expect(Math.max(...zs)).toBeLessThanOrEqual(102.5);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1.5);
  });

  it("leaves a hole in the water polygon where an island stands", () => {
    const lake = inDisc(256, 256, 40);
    const island = inDisc(256, 256, 10);
    const layer = layerOf(
      world((x, z) =>
        lake(x, z) && !island(x, z)
          ? { surface: SURFACE.water, waterDepth: 3 }
          : {},
      ),
    );
    expect(layer.areas.water.rings).toHaveLength(2);
  });

  it("does not stroke a shore along the edge of the explored area", () => {
    const lake = inDisc(256, 256, 30);
    const layer = layerOf(
      world(
        (x, z) => (lake(x, z) ? { surface: SURFACE.water, waterDepth: 2 } : {}),
        (cx) => cx < 16, // blocks with x >= 256 are unexplored
      ),
    );
    const strokes = layer.areas.water.strokes;
    expect(strokes.length).toBeGreaterThan(0); // the real shore is still drawn
    for (const s of strokes) {
      for (const [x] of vertices(s)) expect(x).toBeLessThan(256);
    }
    const fillXs = layer.areas.water.rings.flatMap((r) =>
      vertices(r).map(([x]) => x),
    );
    expect(Math.max(...fillXs)).toBeGreaterThan(255); // the fill reaches the fog
  });

  it("returns an empty layer for a region nobody has explored", () => {
    const layer = layerOf(new Map());
    expect(layer.areas.water.rings).toEqual([]);
    expect(layer.contours).toEqual([]);
    expect(layer.paths).toEqual([]);
  });

  it("produces identical output for identical input", () => {
    const lake = inDisc(200, 200, 25);
    const make = () =>
      JSON.stringify(
        layerOf(
          world((x, z) => (lake(x, z) ? { surface: SURFACE.water } : {})),
        ),
      );
    expect(make()).toBe(make());
  });

  it("records forest and built-up land in their own areas", () => {
    const layer = layerOf(
      world((x, z) => {
        if (x >= 50 && x < 90 && z >= 50 && z < 90)
          return { surface: SURFACE.forest };
        if (x >= 300 && x < 320 && z >= 300 && z < 320)
          return { surface: SURFACE.built };
        return {};
      }),
    );
    expect(layer.areas.forest.rings).toHaveLength(1);
    expect(layer.areas.built.rings).toHaveLength(1);
    expect(layer.areas.water.rings).toHaveLength(0);
  });

  it("draws height contours at the radius where a cone reaches each level", () => {
    // height falls from 94 in the middle to 64 at distance 60
    const layer = layerOf(
      world((x, z) => ({
        height: Math.floor(
          64 + 30 * Math.max(0, 1 - dist(x + 0.5, z + 0.5, 256, 256) / 60),
        ),
      })),
    );
    const at80 = layer.contours.find((c) => c.level === 80);
    expect(at80).toBeDefined();
    expect(at80!.lines).toHaveLength(1);
    for (const [x, z] of vertices(at80!.lines[0])) {
      expect(Math.abs(dist(x, z, 256, 256) - 28)).toBeLessThanOrEqual(1);
    }
  });

  it("does not draw height contours across water", () => {
    const layer = layerOf(
      world(() => ({ surface: SURFACE.water, height: 90, waterDepth: 2 })),
    );
    expect(layer.contours).toEqual([]);
  });

  it("reduces a three-block-wide track to its centre line", () => {
    const layer = layerOf(
      world((x, z) =>
        x >= 100 && x < 300 && z >= 200 && z <= 202
          ? { surface: SURFACE.path }
          : {},
      ),
    );
    expect(layer.paths).toHaveLength(1);
    const pts = vertices(layer.paths[0]);
    const xs = pts.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(190);
    for (const [, z] of pts)
      expect(Math.abs(z - 201.5)).toBeLessThanOrEqual(0.6);
  });

  it("marks which chunks were explored", () => {
    const layer = layerOf(
      world(
        () => ({}),
        (cx, cz) => cx === 0 && cz === 0,
      ),
    );
    const bits = Buffer.from(layer.explored, "base64");
    expect(bits).toHaveLength(128);
    expect(bits[0] & 1).toBe(1); // chunk (0,0)
    expect(bits[0] & 2).toBe(0); // chunk (1,0)
    expect(bits.subarray(1).every((b) => b === 0)).toBe(true);
  });
});
