export type RegionBounds = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

export function parseRegionBounds(
  params: URLSearchParams,
): RegionBounds | null {
  const fields = ["minX", "minZ", "maxX", "maxZ"] as const;
  if (fields.some((key) => !/^-?\d{1,6}$/.test(params.get(key) ?? "")))
    return null;
  const [minX, minZ, maxX, maxZ] = fields.map((key) => Number(params.get(key)));
  if (
    minX > maxX ||
    minZ > maxZ ||
    maxX - minX >= 64 ||
    maxZ - minZ >= 64 ||
    [minX, minZ, maxX, maxZ].some((value) => Math.abs(value) > 60000)
  )
    return null;
  return { minX, minZ, maxX, maxZ };
}
