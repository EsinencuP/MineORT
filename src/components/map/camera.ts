/** World coordinates are blocks; the screen is in CSS pixels; `scale` is pixels per block. */
export type Camera = { x: number; z: number; scale: number };
export type Viewport = { width: number; height: number };

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 4;
export const REGION_BLOCKS = 512;

export const clampScale = (s: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function worldToScreen(
  cam: Camera,
  view: Viewport,
  wx: number,
  wz: number,
): [number, number] {
  return [
    view.width / 2 + (wx - cam.x) * cam.scale,
    view.height / 2 + (wz - cam.z) * cam.scale,
  ];
}

export function screenToWorld(
  cam: Camera,
  view: Viewport,
  sx: number,
  sz: number,
): [number, number] {
  return [
    cam.x + (sx - view.width / 2) / cam.scale,
    cam.z + (sz - view.height / 2) / cam.scale,
  ];
}

/** Zooms by `factor` keeping the world point under screen point (sx, sz) where it is. */
export function zoomAt(
  cam: Camera,
  view: Viewport,
  sx: number,
  sz: number,
  factor: number,
): Camera {
  const scale = clampScale(cam.scale * factor);
  const [wx, wz] = screenToWorld(cam, view, sx, sz);
  return {
    scale,
    x: wx - (sx - view.width / 2) / scale,
    z: wz - (sz - view.height / 2) / scale,
  };
}

/** Moves the map by a drag of (dx, dz) screen pixels. */
export function panBy(cam: Camera, dx: number, dz: number): Camera {
  return { ...cam, x: cam.x - dx / cam.scale, z: cam.z - dz / cam.scale };
}

/** The regions touched by the screen, widened by `margin` pixels on every side. */
export function visibleRegions(
  cam: Camera,
  view: Viewport,
  margin = 0,
): { rx: number; rz: number }[] {
  const [x0, z0] = screenToWorld(cam, view, -margin, -margin);
  const [x1, z1] = screenToWorld(
    cam,
    view,
    view.width + margin,
    view.height + margin,
  );
  const out: { rx: number; rz: number }[] = [];
  for (
    let rz = Math.floor(z0 / REGION_BLOCKS);
    rz <= Math.floor(z1 / REGION_BLOCKS);
    rz++
  ) {
    for (
      let rx = Math.floor(x0 / REGION_BLOCKS);
      rx <= Math.floor(x1 / REGION_BLOCKS);
      rx++
    ) {
      out.push({ rx, rz });
    }
  }
  return out;
}
