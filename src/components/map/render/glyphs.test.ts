import { describe, expect, it } from "vitest";
import { placeGlyphs } from "./glyphs";

const square = (x: number, z: number) =>
  x >= 100 && x < 200 && z >= 50 && z < 150;

describe("placeGlyphs", () => {
  it("returns the same placement for the same area every time", () => {
    const a = placeGlyphs(square, { x: 0, z: 0, w: 512, h: 512 }, 6, 11);
    const b = placeGlyphs(square, { x: 0, z: 0, w: 512, h: 512 }, 6, 11);
    expect(a.length).toBeGreaterThan(50);
    expect(b).toEqual(a);
  });

  it("puts every glyph inside the area", () => {
    for (const g of placeGlyphs(
      square,
      { x: 0, z: 0, w: 512, h: 512 },
      6,
      11,
    )) {
      expect(square(g.x, g.z)).toBe(true);
    }
  });

  it("places a glyph at the same spot whichever window of the map is drawn", () => {
    const whole = placeGlyphs(square, { x: 0, z: 0, w: 512, h: 512 }, 6, 11);
    const part = placeGlyphs(square, { x: 128, z: 64, w: 64, h: 64 }, 6, 11);
    expect(part.length).toBeGreaterThan(0);
    for (const g of part) {
      expect(whole).toContainEqual(g);
    }
  });

  it("keeps glyphs roughly one spacing apart", () => {
    const all = placeGlyphs(square, { x: 0, z: 0, w: 512, h: 512 }, 8, 3);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(
          Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z),
        ).toBeGreaterThan(2);
      }
    }
  });

  it("places nothing in an empty area", () => {
    expect(
      placeGlyphs(() => false, { x: 0, z: 0, w: 512, h: 512 }, 6, 1),
    ).toEqual([]);
  });

  it("varies the glyph shape", () => {
    const shapes = new Set(
      placeGlyphs(square, { x: 0, z: 0, w: 512, h: 512 }, 6, 11).map(
        (g) => g.variant,
      ),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });
});
