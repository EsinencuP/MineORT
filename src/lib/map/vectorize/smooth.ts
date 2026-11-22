/**
 * Corner cutting: every corner is replaced by two points a quarter of the way along its sides.
 * On the short pieces marching squares produces a pass moves the line by at most a quarter of a
 * piece, so two passes stay well within half a block of the original outline.
 */
export function chaikin(
  points: number[],
  closed: boolean,
  iterations: number,
): number[] {
  let pts = points;
  for (let n = 0; n < iterations; n++) {
    const count = pts.length / 2;
    if (count < 3) return pts;
    const out: number[] = [];
    const segments = closed ? count : count - 1;
    if (!closed) out.push(pts[0], pts[1]);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % count;
      const x0 = pts[i * 2];
      const z0 = pts[i * 2 + 1];
      const x1 = pts[j * 2];
      const z1 = pts[j * 2 + 1];
      out.push(
        0.75 * x0 + 0.25 * x1,
        0.75 * z0 + 0.25 * z1,
        0.25 * x0 + 0.75 * x1,
        0.25 * z0 + 0.75 * z1,
      );
    }
    if (!closed) out.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Douglas-Peucker: drops points that lie within `epsilon` blocks of the line between kept ones. */
export function simplify(
  points: number[],
  closed: boolean,
  epsilon: number,
): number[] {
  const count = points.length / 2;
  if (count < 4) return points;
  // a ring is cut open at its first point and closed again afterwards
  const pts = closed ? [...points, points[0], points[1]] : points;
  const n = pts.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let far = -1;
    let farDist = epsilon;
    for (let i = lo + 1; i < hi; i++) {
      const d = distToSegment(
        pts[i * 2],
        pts[i * 2 + 1],
        pts[lo * 2],
        pts[lo * 2 + 1],
        pts[hi * 2],
        pts[hi * 2 + 1],
      );
      if (d > farDist) {
        far = i;
        farDist = d;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([lo, far], [far, hi]);
    }
  }
  const out: number[] = [];
  const last = closed ? n - 1 : n;
  for (let i = 0; i < last; i++)
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

export const round2 = (points: number[]) =>
  points.map((v) => Math.round(v * 100) / 100);
