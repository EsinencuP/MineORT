export type TrailPoint = [x: number, z: number];

export type Trail = { mine: boolean; points: TrailPoint[] };

export type TrailHistory = {
  nickname: string | null;
  trails: Trail[];
  ownLatestAt: number | null;
};

export const TRAIL_TELEPORT_BLOCKS = 100;

function distanceSquared(point: TrailPoint, a: TrailPoint, b: TrailPoint) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length),
      )
    : 0;
  return (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dz) ** 2;
}

/** Douglas–Peucker simplification of one continuous segment, in world blocks. */
export function simplifyTrail(
  points: TrailPoint[],
  tolerance = 0.5,
): TrailPoint[] {
  if (points.length < 3) return points;
  const kept = new Set([0, points.length - 1]);
  const ranges = [[0, points.length - 1]];
  while (ranges.length) {
    const [first, last] = ranges.pop()!;
    let farthest = first;
    let distance = tolerance ** 2;
    for (let i = first + 1; i < last; i++) {
      const candidate = distanceSquared(points[i], points[first], points[last]);
      if (candidate > distance) {
        farthest = i;
        distance = candidate;
      }
    }
    if (farthest !== first) {
      kept.add(farthest);
      ranges.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => kept.has(i));
}
