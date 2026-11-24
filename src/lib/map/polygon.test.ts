import { describe, expect, it } from "vitest";
import { validPolygon } from "./polygon";
import { parseRegionBounds } from "./region-bounds";

describe("atlas areas", () => {
  it("accepts a concave area in the same coordinate plane", () => {
    expect(
      validPolygon([
        [0, 0],
        [9, 0],
        [9, 7],
        [5, 3],
        [0, 7],
      ]),
    ).toBe(true);
  });
  it("rejects self-intersections, repeated points and collinear closed paths", () => {
    expect(
      validPolygon([
        [0, 0],
        [9, 7],
        [0, 7],
        [9, 0],
      ]),
    ).toBe(false);
    expect(
      validPolygon([
        [0, 0],
        [9, 0],
        [9, 7],
        [0, 0],
      ]),
    ).toBe(false);
    expect(
      validPolygon([
        [0, 0],
        [9, 0],
        [12, 0],
      ]),
    ).toBe(false);
  });
  it("accepts a viewport containing more than 500 regions and bounds its maximum size", () => {
    expect(
      parseRegionBounds(new URLSearchParams("minX=-10&maxX=20&minZ=0&maxZ=20")),
    ).not.toBeNull();
    expect(
      parseRegionBounds(new URLSearchParams("minX=0&maxX=64&minZ=0&maxZ=20")),
    ).toBeNull();
  });
});
