import { describe, expect, it } from "vitest";
import { simplifyTrail } from "./trail-geometry";

describe("trail simplification", () => {
  it("keeps endpoints and deviations greater than half a block", () => {
    expect(
      simplifyTrail([
        [0, 0],
        [1, 0.25],
        [2, 0],
        [3, 1],
        [4, 0],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [3, 1],
      [4, 0],
    ]);
  });

  it("preserves a closed loop even though the endpoints coincide", () => {
    const loop: [number, number][] = [
      [0, 0],
      [3, 0],
      [3, 3],
      [0, 3],
      [0, 0],
    ];
    expect(simplifyTrail(loop)).toEqual(loop);
  });
});
