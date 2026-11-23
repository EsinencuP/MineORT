// Markers on the canvas the way AtlasMap's MapView.drawMarkers() draws them (MIT, erkinpaw): the icon
// at 16 GUI pixels centred on the block, a highlight when selected or hovered, the name on a cream
// label below once the zoom is 1.5 or more. A recoloured icon is its grey copy multiplied by the ink.

import { worldToScreen, type Camera, type Viewport } from "../camera";

export type MapMarker = {
  id: string;
  kind: "point" | "label";
  dim: "overworld" | "nether";
  x: number;
  z: number;
  y?: number | null;
  name: string;
  description: string;
  icon: string;
  color: string | null;
  visibility: "public" | "guild" | "private";
  status: "pending" | "approved" | "hidden";
  author: string;
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
};

const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();

/** The icon image, loading it on first use; `onLoad` repaints once it arrives. */
function image(path: string, onLoad: () => void) {
  let img = images.get(path);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = path;
    images.set(path, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** The icon as drawn: its own colours, or its grey copy multiplied by the chosen ink. */
export function iconImage(
  icon: string,
  color: string | null,
  onLoad: () => void,
): CanvasImageSource | null {
  if (!color) return image(`/map/ui/markers/${icon}.png`, onLoad);
  const key = `${icon}${color}`;
  const done = tinted.get(key);
  if (done) return done;
  const grey = image(`/map/ui/markers_tint/${icon}.png`, onLoad);
  if (!grey) return null;
  const c = document.createElement("canvas");
  c.width = grey.naturalWidth;
  c.height = grey.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(grey, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(grey, 0, 0);
  tinted.set(key, c);
  return c;
}

/** Screen centre of a marker: the middle of its block. */
export const markerPoint = (
  cam: Camera,
  view: Viewport,
  m: { x: number; z: number },
) => worldToScreen(cam, view, m.x + 0.5, m.z + 0.5);

/** The marker under the pointer: within three quarters of an icon, the closest wins. */
export function markerAt(
  cam: Camera,
  view: Viewport,
  list: MapMarker[],
  mx: number,
  my: number,
  g: number,
): MapMarker | null {
  let best: MapMarker | null = null;
  let bestD = 16 * g * 0.75;
  for (const m of list) {
    const [sx, sy] = markerPoint(cam, view, m);
    const d = Math.max(Math.abs(mx - sx), Math.abs(my - sy));
    if (d <= bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  view: Viewport,
  list: MapMarker[],
  opts: {
    g: number;
    /** the resolved CSS font family of the map */
    family: string;
    selected: string | null;
    hovered: string | null;
    colors: {
      ink: string;
      inkSoft: string;
      cream: string;
      gold: string;
      goldLight: string;
    };
    onLoad: () => void;
  },
) {
  const { g, colors } = opts;
  const s = 16 * g;
  const zoom = cam.scale / g;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.font = `${10.5 * g}px ${opts.family}`;
  for (const m of list) {
    const [px, py] = markerPoint(cam, view, m);
    if (px < -s || py < -s || px > view.width + s || py > view.height + s)
      continue;
    const ix = Math.round(px - s / 2);
    const iy = Math.round(py - s / 2);
    const sel = m.id === opts.selected;
    const hov = m.id === opts.hovered;

    if (m.kind === "label") {
      // a place name written on the map, larger, with a cream halo instead of a box
      ctx.font = `${13 * g}px ${opts.family}`;
      const tw = ctx.measureText(m.name).width;
      ctx.lineJoin = "round";
      ctx.lineWidth = 3 * g;
      ctx.strokeStyle = colors.cream + "d0";
      ctx.strokeText(m.name, Math.round(px - tw / 2), Math.round(py + 4 * g));
      ctx.fillStyle = sel || hov ? colors.gold : colors.ink;
      ctx.fillText(m.name, Math.round(px - tw / 2), Math.round(py + 4 * g));
      ctx.font = `${10.5 * g}px ${opts.family}`;
      continue;
    }

    if (sel || hov) {
      const pad = 2 * g;
      ctx.fillStyle = sel ? colors.goldLight + "60" : "rgba(255,255,255,0.25)";
      ctx.fillRect(ix - pad, iy - pad, s + pad * 2, s + pad * 2);
      ctx.strokeStyle = sel ? colors.gold : colors.inkSoft;
      ctx.lineWidth = g;
      ctx.strokeRect(
        ix - pad + g / 2,
        iy - pad + g / 2,
        s + pad * 2 - g,
        s + pad * 2 - g,
      );
    }
    const img = iconImage(m.icon, m.color, opts.onLoad);
    // a marker waiting for a moderator, or hidden by one, is drawn faded for its author and staff
    ctx.globalAlpha = m.status === "approved" ? 1 : 0.55;
    if (img) ctx.drawImage(img, ix, iy, s, s);
    ctx.globalAlpha = 1;

    if ((zoom >= 1.5 || sel || hov) && m.name) {
      const tw = Math.ceil(ctx.measureText(m.name).width);
      const tx = Math.round(px - tw / 2);
      const ty = iy + s + 2 * g;
      ctx.fillStyle = colors.cream + "d0";
      ctx.fillRect(tx - 3 * g, ty - 2 * g, tw + 6 * g, 11 * g);
      ctx.strokeStyle = colors.ink + "80";
      ctx.lineWidth = g;
      ctx.strokeRect(tx - 2.5 * g, ty - 1.5 * g, tw + 5 * g, 10 * g);
      ctx.fillStyle = colors.ink;
      ctx.fillText(m.name, tx, ty + 7 * g);
    }
  }
  ctx.restore();
}
