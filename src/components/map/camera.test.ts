import { describe, expect, it } from "vitest";
import {
  clampScale,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  screenToWorld,
  visibleRegions,
  worldToScreen,
  zoomAt,
  type Camera,
} from "./camera";

const view = { width: 1000, height: 600 };
const cam = (over: Partial<Camera> = {}): Camera => ({
  x: 0,
  z: 0,
  scale: 2,
  ...over,
});

describe("camera", () => {
  it("puts the camera centre in the middle of the screen", () => {
    expect(worldToScreen(cam({ x: 100, z: -40 }), view, 100, -40)).toEqual([
      500, 300,
    ]);
  });

  it("converts a screen point to the world point it shows and back", () => {
    const c = cam({ x: 321.5, z: -87.25, scale: 3.5 });
    const [wx, wz] = screenToWorld(c, view, 123, 456);
    const [sx, sz] = worldToScreen(c, view, wx, wz);
    expect(sx).toBeCloseTo(123, 9);
    expect(sz).toBeCloseTo(456, 9);
  });

  it("zooms about the pointer so the world point under it stays put", () => {
    const c = cam({ x: 50, z: 80, scale: 1 });
    const before = screenToWorld(c, view, 700, 150);
    const zoomed = zoomAt(c, view, 700, 150, 2);
    const after = screenToWorld(zoomed, view, 700, 150);
    expect(zoomed.scale).toBe(2);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("never zooms past the limits", () => {
    expect(clampScale(0.0001)).toBe(MIN_SCALE);
    expect(clampScale(1e6)).toBe(MAX_SCALE);
    expect(zoomAt(cam({ scale: MAX_SCALE }), view, 0, 0, 10).scale).toBe(
      MAX_SCALE,
    );
  });

  it("pans so that dragging right moves the map right", () => {
    const moved = panBy(cam({ scale: 2 }), 100, -50);
    expect(moved.x).toBe(-50); // the map moved 100 px right: the centre moved 50 blocks left
    expect(moved.z).toBe(25);
  });

  it("lists exactly the regions the screen touches", () => {
    // 1000 x 600 px at 1 px per block shows 1000 x 600 blocks around the origin
    const r = visibleRegions(cam({ scale: 1 }), view);
    const keys = r.map((x) => `${x.rx},${x.rz}`).sort();
    // x from -500 to 500 spans regions -1..0, z from -300 to 300 spans -1..0
    expect(keys).toEqual(["-1,-1", "-1,0", "0,-1", "0,0"]);
  });

  it("includes the region just beyond the screen edge when asked for a margin", () => {
    const without = visibleRegions(cam({ x: 256, z: 256, scale: 1 }), view, 0);
    const margin = visibleRegions(cam({ x: 256, z: 256, scale: 1 }), view, 600);
    expect(margin.length).toBeGreaterThan(without.length);
  });
});
