// Drawing on the map and the ruler, ported from AtlasMap by erkinpaw (MIT,
// https://github.com/erkinpaw/atlasmap): Stroke.java, MapView.drawStroke(), MapScreen's palette,
// eraser and ruler. Copyright (c) 2026 erkinpaw. See public/map/ATLASMAP-LICENSE.txt.
// Points are world blocks (x, z pairs); widths are GUI pixels, so a drawing reads the same at any zoom.

import { worldToScreen, type Camera, type Viewport } from "./camera";

export type StrokeType = "pen" | "line" | "rect" | "circle";
export type Stroke = {
  type: StrokeType;
  color: string;
  width: number;
  pts: number[];
};
export type DrawTool = StrokeType | "eraser";

export const DRAW_TOOLS: { tool: DrawTool; icon: string; label: string }[] = [
  { tool: "pen", icon: "pen", label: "Перо — свободное рисование" },
  { tool: "line", icon: "line", label: "Прямая линия" },
  { tool: "rect", icon: "rect", label: "Прямоугольник" },
  { tool: "circle", icon: "circle", label: "Круг" },
  { tool: "eraser", icon: "eraser", label: "Ластик" },
];
export const WIDTHS = [1, 2, 3, 5];
export const RED = "#9c3b2a";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** 20 hues in three shades (light, normal, dark): 60 inks in total. */
export const PALETTE: string[] = (() => {
  const base = [
    0x3a2616, 0x7a4e2a, 0xb03a2e, 0xd35a2a, 0xe08a2e, 0xe0b03a, 0xe8d44a,
    0x9dbb3a, 0x4e8a34, 0x2f5e2a, 0x2e8a7e, 0x3aa0c0, 0x5a8fd0, 0x2f5aa8,
    0x45408f, 0x7a3e9a, 0xb0408a, 0xd9708a, 0x8a8a8a, 0xf2e6c8,
  ];
  const n = base.length;
  const out = new Array<string>(n * 3);
  base.forEach((c, i) => {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    out[i] = hex(
      (mix(r, 255, 0.45) << 16) | (mix(g, 255, 0.45) << 8) | mix(b, 255, 0.45),
    );
    out[n + i] = hex(c);
    out[n * 2 + i] = hex(
      (Math.floor(r * 0.58) << 16) |
        (Math.floor(g * 0.58) << 8) |
        Math.floor(b * 0.58),
    );
  });
  out[n - 1] = "#ffffff";
  out[n * 3 - 1] = "#000000";
  return out;
})();

/** Draws one stroke; `g` is the size of a GUI pixel on screen. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  view: Viewport,
  s: Stroke,
  g: number,
) {
  const p = s.pts;
  if (p.length < 2) return;
  const at = (i: number) => worldToScreen(cam, view, p[i], p[i + 1]);
  const w = Math.max(1, s.width) * g;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = w;
  ctx.lineCap = w >= 2 * g ? "round" : "butt";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (s.type === "line" && p.length >= 4) {
    ctx.moveTo(...at(0));
    ctx.lineTo(...at(2));
  } else if (s.type === "rect" && p.length >= 4) {
    const [x0, y0] = at(0);
    const [x1, y1] = at(2);
    ctx.rect(
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.abs(x1 - x0),
      Math.abs(y1 - y0),
    );
  } else if (s.type === "circle" && p.length >= 4) {
    const [cx, cy] = at(0);
    const r = Math.hypot(p[2] - p[0], p[3] - p[1]) * cam.scale;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (p.length === 2) {
    const [x, y] = at(0);
    ctx.fillRect(x - w / 2, y - w / 2, w, w);
  } else {
    ctx.moveTo(...at(0));
    for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(...at(i));
  }
  ctx.stroke();
  ctx.restore();
}

function segDist(
  mx: number,
  my: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t =
    l2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2));
  return Math.hypot(mx - (ax + t * dx), my - (ay + t * dy));
}

/** Distance in screen pixels from (mx, my) to a stroke, for the eraser. */
export function distanceTo(
  cam: Camera,
  view: Viewport,
  s: Stroke,
  mx: number,
  my: number,
): number {
  const p = s.pts;
  const at = (i: number) => worldToScreen(cam, view, p[i], p[i + 1]);
  if (s.type === "rect" && p.length >= 4) {
    const [x0, y0] = at(0);
    const [x1, y1] = at(2);
    return Math.min(
      segDist(mx, my, x0, y0, x1, y0),
      segDist(mx, my, x1, y0, x1, y1),
      segDist(mx, my, x1, y1, x0, y1),
      segDist(mx, my, x0, y1, x0, y0),
    );
  }
  if (s.type === "circle" && p.length >= 4) {
    const [cx, cy] = at(0);
    const r = Math.hypot(p[2] - p[0], p[3] - p[1]) * cam.scale;
    return Math.abs(Math.hypot(mx - cx, my - cy) - r);
  }
  if (p.length === 2) {
    const [x, y] = at(0);
    return Math.hypot(mx - x, my - y);
  }
  let best = Infinity;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [ax, ay] = at(i);
    const [bx, by] = at(i + 2);
    best = Math.min(best, segDist(mx, my, ax, ay, bx, by));
  }
  return best;
}

/** 123.4 below a hundred blocks, whole blocks above, as the mod prints distances. */
export const fmtDistance = (d: number) =>
  d >= 100 ? String(Math.round(d)) : d.toFixed(1);

/** A short label on cream with a red outline, centred on (cx, cy); `g` is a GUI pixel. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  g: number,
  colors: { cream: string; ink: string },
) {
  const w = Math.ceil(ctx.measureText(text).width);
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - 5 * g);
  ctx.fillStyle = colors.cream + "e0";
  ctx.fillRect(x - 3 * g, y - 2 * g, w + 6 * g, 12 * g);
  ctx.strokeStyle = RED;
  ctx.lineWidth = g;
  ctx.strokeRect(x - 2.5 * g, y - 1.5 * g, w + 5 * g, 11 * g);
  ctx.fillStyle = colors.ink;
  ctx.fillText(text, x, y + 7.5 * g);
}

/** A dashed line of the given width (screen pixels), dashes of `dash` pixels. */
export function dashedLine(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  width: number,
  color: string,
  dash: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([dash, dash]);
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
  ctx.restore();
}

const STORE = (dim: string) => `mineort.map.drawings.${dim}`;
const MAX_STROKES = 2000;

/** Drawings live in this browser only, one list per dimension, like the mod's drawings.json. */
export function loadStrokes(dim: string): Stroke[] {
  try {
    const raw = localStorage.getItem(STORE(dim));
    const list = raw ? (JSON.parse(raw) as Stroke[]) : [];
    return Array.isArray(list)
      ? list.filter(
          (s) =>
            s &&
            ["pen", "line", "rect", "circle"].includes(s.type) &&
            Array.isArray(s.pts) &&
            s.pts.every(Number.isFinite),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveStrokes(dim: string, list: Stroke[]) {
  try {
    localStorage.setItem(STORE(dim), JSON.stringify(list.slice(-MAX_STROKES)));
  } catch {
    /* storage may be full or blocked; the drawings then last until the page closes */
  }
}
