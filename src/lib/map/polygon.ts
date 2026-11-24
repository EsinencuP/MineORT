export type Vertex = [x: number, z: number];
export const MAX_VERTICES = 64;
const BORDER = 30_000_000;

function cross(a: Vertex, b: Vertex, c: Vertex) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Vertex, b: Vertex, p: Vertex) {
  return (
    cross(a, b, p) === 0 &&
    [0, 1].every(
      (i) => p[i] >= Math.min(a[i], b[i]) && p[i] <= Math.max(a[i], b[i]),
    )
  );
}

function intersects(a: Vertex, b: Vertex, c: Vertex, d: Vertex) {
  if (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  )
    return true;
  return (
    Math.sign(cross(a, b, c)) * Math.sign(cross(a, b, d)) < 0 &&
    Math.sign(cross(c, d, a)) * Math.sign(cross(c, d, b)) < 0
  );
}

export function validPolygon(input: unknown): input is Vertex[] {
  if (
    !Array.isArray(input) ||
    input.length < 3 ||
    input.length > MAX_VERTICES ||
    input.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== 2 ||
        !v.every((n) => Number.isInteger(n) && Math.abs(n) <= BORDER),
    )
  )
    return false;
  const vertices = input as Vertex[];
  const size = vertices.length;
  if (new Set(vertices.map(String)).size !== size) return false;
  let bent = false;
  for (let i = 0; i < size; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % size];
    const c = vertices[(i + 2) % size];
    if (cross(a, b, c) !== 0) bent = true;
    if (onSegment(a, b, c) || onSegment(b, c, a)) return false;
    for (let j = i + 2; j < size; j++) {
      if (i === 0 && j === size - 1) continue;
      if (intersects(a, b, vertices[j], vertices[(j + 1) % size])) return false;
    }
  }
  return bent;
}
