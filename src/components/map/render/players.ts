import { worldToScreen, type Camera, type Viewport } from "../camera";
import type { Dot } from "../players";

const RED = "#9c3b2a";

export type PinStyle = {
  ink: string;
  cream: string;
  /** a CSS font family, already resolved */
  family: string;
};

/**
 * Players as red arrows that point the way they face, with their name on a paper label, the way
 * AtlasMap draws the player and its markers. Only the position relative to the map shows; no
 * numbers. Staff get the exact coordinates appended; nobody else sees a number.
 */
export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  size: Viewport,
  dots: Iterable<Dot>,
  dim: Dot["dim"],
  staff: boolean,
  style: PinStyle,
) {
  ctx.save();
  ctx.font = `12px ${style.family}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "miter";
  for (const d of dots) {
    if (d.dim !== dim) continue;
    const [fx, fy] = worldToScreen(cam, size, d.x, d.z);
    const sx = Math.round(fx);
    const sy = Math.round(fy);
    if (sx < -80 || sy < -30 || sx > size.width + 80 || sy > size.height + 30)
      continue;

    // Minecraft yaw 0 faces south (down the map) and 90 faces west, so the arrow, which points up
    // when it is not turned, is rotated by half a turn plus the yaw.
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI + (d.facing * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.ink;
    ctx.stroke();
    ctx.restore();

    const label =
      staff && d.y !== undefined
        ? `${d.name} · ${Math.round(d.tx)}, ${d.y}, ${Math.round(d.tz)}`
        : d.name;
    const w = Math.ceil(ctx.measureText(label).width);
    const lx = Math.round(sx - w / 2);
    const ly = sy + 16;
    ctx.fillStyle = style.cream;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(lx - 4, ly - 8, w + 8, 16);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - 3.5, ly - 7.5, w + 7, 15);
    ctx.fillStyle = style.ink;
    ctx.fillText(label, lx, ly + 1);
  }
  ctx.restore();
}
