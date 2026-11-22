import { worldToScreen, type Camera, type Viewport } from "../camera";
import type { Dot } from "../players";

const INK = "#3a3026";
const RED = "#b3402a";

/**
 * Players as inked map pins with their name in a paper label. Only the position relative to the
 * drawn world shows; no numbers. Staff get the exact coordinates appended; nobody else sees a number.
 */
export function drawPlayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  size: Viewport,
  dots: Iterable<Dot>,
  dim: Dot["dim"],
  staff: boolean,
) {
  ctx.save();
  ctx.font = "600 12px Georgia, 'Times New Roman', serif";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const d of dots) {
    if (d.dim !== dim) continue;
    const [sx, sy] = worldToScreen(cam, size, d.x, d.z);
    if (sx < -60 || sy < -30 || sx > size.width + 60 || sy > size.height + 30)
      continue;

    // a small arrow for the way the player faces, under the dot
    const a = (d.facing * Math.PI) / 180;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-a + Math.PI); // Minecraft yaw 0 faces south (down the map)
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(4.5, -5);
    ctx.lineTo(-4.5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();

    const label =
      staff && d.y !== undefined
        ? `${d.name} · ${Math.round(d.tx)}, ${d.y}, ${Math.round(d.tz)}`
        : d.name;
    const w = ctx.measureText(label).width;
    const lx = sx + 11;
    ctx.fillStyle = "rgba(251,243,220,0.92)";
    ctx.strokeStyle = "rgba(58,48,38,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx - 4, sy - 9, w + 8, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label, lx, sy + 0.5);
  }
  ctx.restore();
}
