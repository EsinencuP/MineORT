import { worldToScreen, type Camera, type Viewport } from "../camera";
import type { Dot } from "../players";

export type PinStyle = {
  ink: string;
  cream: string;
  /** one GUI pixel in screen pixels */
  g: number;
  /** the mod's player arrow (tools/arrow.png), once it has loaded */
  arrow: HTMLImageElement | null;
};

/**
 * Players the way AtlasMap draws the player: its arrow texture, 16 GUI pixels, turned by the yaw
 * plus half a turn. Below it the name on a cream label with a soft ink outline, the way the mod
 * labels its markers. Staff get the exact coordinates appended; nobody else sees a number.
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
  const { g } = style;
  const s = 16 * g;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "alphabetic";
  for (const d of dots) {
    if (d.dim !== dim) continue;
    const [fx, fy] = worldToScreen(cam, size, d.x, d.z);
    if (
      fx < -s * 6 ||
      fy < -s ||
      fx > size.width + s * 6 ||
      fy > size.height + s * 2
    )
      continue;

    if (style.arrow) {
      ctx.save();
      ctx.translate(Math.round(fx), Math.round(fy));
      ctx.rotate(((d.facing + 180) * Math.PI) / 180);
      ctx.drawImage(style.arrow, -s / 2, -s / 2, s, s);
      ctx.restore();
    }

    const name =
      staff && d.y !== undefined
        ? `${d.name}  ${Math.round(d.tx)}, ${d.y}, ${Math.round(d.tz)}`
        : d.name;
    const tw = Math.ceil(ctx.measureText(name).width);
    const tx = Math.round(fx - tw / 2);
    const ty = Math.round(fy - s / 2) + s + 2 * g;
    ctx.fillStyle = style.cream + "d0";
    ctx.fillRect(tx - 3 * g, ty - 2 * g, tw + 6 * g, 11 * g);
    ctx.strokeStyle = style.ink + "80";
    ctx.lineWidth = g;
    ctx.strokeRect(tx - 2.5 * g, ty - 1.5 * g, tw + 5 * g, 10 * g);
    ctx.fillStyle = style.ink;
    ctx.fillText(name, tx, ty + 7 * g);
  }
  ctx.restore();
}
