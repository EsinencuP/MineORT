import type { TrailPoint } from "./trail-geometry";

export function routeLength(points: readonly TrailPoint[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, z] = points[i];
    const [previousX, previousZ] = points[i - 1];
    length += Math.hypot(x - previousX, z - previousZ);
  }
  return length;
}
