import type { TrailPoint } from "./trail-geometry";

export const MAX_ROUTE_POINTS = 128;
const WORLD_LIMIT = 30_000_000;

export function routeLength(points: readonly TrailPoint[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, z] = points[i];
    const [previousX, previousZ] = points[i - 1];
    length += Math.hypot(x - previousX, z - previousZ);
  }
  return length;
}

export function validRoutePoints(points: unknown): points is TrailPoint[] {
  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > MAX_ROUTE_POINTS
  )
    return false;
  return points.every(
    (point, index) =>
      Array.isArray(point) &&
      point.length === 2 &&
      point.every(
        (axis) =>
          typeof axis === "number" &&
          Number.isInteger(axis) &&
          Math.abs(axis) <= WORLD_LIMIT,
      ) &&
      (index === 0 ||
        point[0] !== points[index - 1][0] ||
        point[1] !== points[index - 1][1]),
  );
}
