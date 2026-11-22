"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Layer } from "@/lib/map/vectorize";
import {
  clampScale,
  panBy,
  REGION_BLOCKS,
  visibleRegions,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { PlayerFeed, type FeedState } from "./players";
import { drawRegion } from "./render/draw";
import { drawPlayers } from "./render/players";

type Dim = "overworld" | "nether";
type Ref = { rx: number; rz: number };
type Loaded = { version: number; canvas: HTMLCanvasElement };
type Payload =
  | { rx: number; rz: number; version: number; unchanged: true }
  | { rx: number; rz: number; version: number; layer: Layer };
type Status = "loading" | "empty" | "ready" | "error";

const REFRESH_MS = 30_000;
const PARCHMENT = "#efe3c6";

/** A paper texture tile, painted once: speckles and soft stains over parchment. */
function paperTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PARCHMENT;
  ctx.fillRect(0, 0, 256, 256);
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 30 + rnd() * 50;
    // drawn again one tile over in every direction, so the pattern has no seams
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        const g = ctx.createRadialGradient(
          x + dx,
          y + dy,
          0,
          x + dx,
          y + dy,
          r,
        );
        g.addColorStop(0, "rgba(150,110,60,0.07)");
        g.addColorStop(1, "rgba(150,110,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(110,80,40,${0.03 + rnd() * 0.07})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return c;
}

export function MapView() {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: 256, z: 256, scale: 1 });
  const size = useRef<Viewport>({ width: 800, height: 500 });
  const loaded = useRef(new Map<string, Loaded>());
  const index = useRef<Ref[]>([]);
  const paper = useRef<HTMLCanvasElement | null>(null);
  const queued = useRef(false);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const feed = useRef<PlayerFeed | null>(null);
  const easing = useRef(false);
  const [feedState, setFeedState] = useState<FeedState>("connecting");

  const [dim, setDim] = useState<Dim>("overworld");
  const [status, setStatus] = useState<Status>("loading");
  const dimRef = useRef<Dim>("overworld");

  const paint = useCallback(() => {
    queued.current = false;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paper.current ??= paperTile();
    ctx.fillStyle = ctx.createPattern(paper.current, "repeat")!;
    ctx.fillRect(0, 0, width, height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (const { rx, rz } of visibleRegions(cam.current, size.current)) {
      const region = loaded.current.get(`${dimRef.current}:${rx}:${rz}`);
      if (!region) continue;
      const [sx, sz] = worldToScreen(
        cam.current,
        size.current,
        rx * REGION_BLOCKS,
        rz * REGION_BLOCKS,
      );
      const side = REGION_BLOCKS * cam.current.scale;
      ctx.drawImage(region.canvas, sx, sz, side, side);
    }

    if (feed.current)
      drawPlayers(
        ctx,
        cam.current,
        size.current,
        feed.current.dots.values(),
        dimRef.current,
        feed.current.staff,
      );

    // an aged edge
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.45,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    vignette.addColorStop(0, "rgba(120,86,44,0)");
    vignette.addColorStop(1, "rgba(120,86,44,0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }, []);

  const requestPaint = useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    requestAnimationFrame(paint);
  }, [paint]);

  /** Keeps painting while a dot is still gliding to its new position. */
  const glide = useCallback(() => {
    if (easing.current) return;
    easing.current = true;
    const step = () => {
      const moving = feed.current?.ease() ?? false;
      requestPaint();
      if (moving) requestAnimationFrame(step);
      else easing.current = false;
    };
    requestAnimationFrame(step);
  }, [requestPaint]);

  /** Fetches the regions near the screen that are missing or out of date. */
  const loadVisible = useCallback(async () => {
    const d = dimRef.current;
    const built = new Set(index.current.map((r) => `${r.rx}:${r.rz}`));
    const want = visibleRegions(cam.current, size.current, 320).filter((r) =>
      built.has(`${r.rx}:${r.rz}`),
    );
    for (let i = 0; i < want.length; i += 9) {
      const part = want.slice(i, i + 9);
      const known = part
        .map((r) => [r, loaded.current.get(`${d}:${r.rx}:${r.rz}`)] as const)
        .filter(([, l]) => l)
        .map(([r, l]) => `${r.rx}:${r.rz}:${l!.version}`);
      const q = new URLSearchParams({
        dim: d,
        r: part.map((r) => `${r.rx}:${r.rz}`).join(","),
      });
      if (known.length) q.set("known", known.join(","));
      const res = await fetch(`/api/map/regions?${q}`);
      if (!res.ok) throw new Error(`regions ${res.status}`);
      const { regions } = (await res.json()) as { regions: Payload[] };
      for (const p of regions) {
        if ("unchanged" in p) continue;
        loaded.current.set(`${d}:${p.rx}:${p.rz}`, {
          version: p.version,
          canvas: drawRegion(p.layer),
        });
      }
      requestPaint();
    }
  }, [requestPaint]);

  const refresh = useCallback(
    async (fit: boolean) => {
      try {
        const res = await fetch(
          `/api/map/regions?dim=${dimRef.current}&index=1`,
        );
        if (!res.ok) throw new Error(`index ${res.status}`);
        index.current = ((await res.json()) as { regions: Ref[] }).regions;
        if (index.current.length === 0) {
          setStatus("empty");
          requestPaint();
          return;
        }
        if (fit) {
          const xs = index.current.map((r) => r.rx);
          const zs = index.current.map((r) => r.rz);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs) + 1;
          const z0 = Math.min(...zs);
          const z1 = Math.max(...zs) + 1;
          const span = Math.max(
            ((x1 - x0) * REGION_BLOCKS) / size.current.width,
            ((z1 - z0) * REGION_BLOCKS) / size.current.height,
          );
          cam.current = {
            x: ((x0 + x1) / 2) * REGION_BLOCKS,
            z: ((z0 + z1) / 2) * REGION_BLOCKS,
            scale: clampScale(Math.min(1.5, 1 / span)),
          };
        }
        setStatus("ready");
        await loadVisible();
      } catch {
        setStatus("error");
      }
    },
    [loadVisible, requestPaint],
  );

  const scheduleLoad = useCallback(() => {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(
      () => void loadVisible().catch(() => {}),
      150,
    );
  }, [loadVisible]);

  // size the canvas to its frame
  useEffect(() => {
    const el = frame.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      size.current = { width, height };
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      requestPaint();
      scheduleLoad();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [requestPaint, scheduleLoad]);

  // first load, a change of dimension, and a refresh every half minute
  useEffect(() => {
    dimRef.current = dim;
    // started from a timer, not the effect body, because loading updates the screen state
    const first = setTimeout(() => void refresh(true), 0);
    const timer = setInterval(() => void refresh(false), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [dim, refresh]);

  // live players: a guest gets none, a signed-in user gets the channels the site opens for them
  useEffect(() => {
    const f = new PlayerFeed(setFeedState, glide);
    feed.current = f;
    void f.start();
    return () => {
      f.stop();
      feed.current = null;
    };
  }, [glide]);

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      cam.current = zoomAt(
        cam.current,
        size.current,
        e.clientX - r.left,
        e.clientY - r.top,
        Math.exp(-e.deltaY * 0.0015),
      );
      requestPaint();
      scheduleLoad();
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [requestPaint, scheduleLoad]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const all = [...pointers.current.values()];
    if (all.length === 1) {
      cam.current = panBy(cam.current, e.clientX - prev.x, e.clientY - prev.y);
    } else if (all.length === 2) {
      const d = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      if (pinch.current) {
        const r = e.currentTarget.getBoundingClientRect();
        cam.current = zoomAt(
          cam.current,
          size.current,
          (all[0].x + all[1].x) / 2 - r.left,
          (all[0].y + all[1].y) / 2 - r.top,
          d / pinch.current,
        );
      }
      pinch.current = d;
    }
    requestPaint();
    scheduleLoad();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = 0;
  };

  const zoomBy = (factor: number) => {
    cam.current = zoomAt(
      cam.current,
      size.current,
      size.current.width / 2,
      size.current.height / 2,
      factor,
    );
    requestPaint();
    scheduleLoad();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 80;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (keys[e.key]) {
      cam.current = panBy(cam.current, ...keys[e.key]);
    } else if (e.key === "+" || e.key === "=") {
      zoomBy(1.25);
      return;
    } else if (e.key === "-") {
      zoomBy(0.8);
      return;
    } else return;
    e.preventDefault();
    requestPaint();
    scheduleLoad();
  };

  const tool =
    "inline-flex size-10 items-center justify-center rounded-full border border-[#3a3026]/60 bg-[#fbf3dc]/90 text-lg font-semibold text-[#3a3026] shadow-sm hover:bg-[#fff8e6] focus-visible:outline-2";

  return (
    <div
      ref={frame}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative h-[72dvh] min-h-[420px] touch-none overflow-hidden rounded-(--radius-card) border-4 border-double border-[#3a3026] bg-[#efe3c6]"
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label="Рисованная карта мира. Перетаскивайте, чтобы двигать, колесо мыши или кнопки плюс и минус, чтобы менять масштаб."
        className="absolute inset-0 size-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button
          type="button"
          className={tool}
          aria-label="Приблизить"
          onClick={() => zoomBy(1.4)}
        >
          +
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Отдалить"
          onClick={() => zoomBy(1 / 1.4)}
        >
          −
        </button>
      </div>

      <div
        className="absolute top-3 left-3 flex gap-2"
        role="group"
        aria-label="Измерение"
      >
        {(["overworld", "nether"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={dim === d}
            onClick={() => {
              setStatus("loading");
              setDim(d);
            }}
            className={`rounded-full border border-[#3a3026]/60 px-4 py-1.5 text-sm font-semibold ${
              dim === d
                ? "bg-[#3a3026] text-[#fbf3dc]"
                : "bg-[#fbf3dc]/90 text-[#3a3026]"
            }`}
          >
            {d === "overworld" ? "Верхний мир" : "Незер"}
          </button>
        ))}
      </div>

      <svg
        aria-hidden="true"
        viewBox="-50 -50 100 100"
        className="pointer-events-none absolute bottom-3 left-3 size-20 opacity-80"
      >
        <circle r="30" fill="none" stroke="#3a3026" strokeWidth="1" />
        <circle r="22" fill="none" stroke="#3a3026" strokeWidth="0.5" />
        <path
          d="M0 -44 L7 -7 L44 0 L7 7 L0 44 L-7 7 L-44 0 L-7 -7 Z"
          fill="#efe3c6"
          stroke="#3a3026"
          strokeWidth="1.2"
        />
        <path d="M0 -44 L7 -7 L0 0 Z" fill="#3a3026" />
        <path d="M0 44 L-7 7 L0 0 Z" fill="#3a3026" />
        <text
          y="-47"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#3a3026"
        >
          С
        </text>
      </svg>

      {feedState === "guest" && (
        <a
          href="/api/auth/telegram/start?return_to=/map"
          className="absolute right-3 bottom-3 rounded-full border border-[#3a3026]/60 bg-[#fbf3dc]/90 px-4 py-1.5 text-sm text-[#3a3026] hover:bg-[#fff8e6]"
        >
          Войдите, чтобы видеть игроков
        </a>
      )}
      {feedState === "nonmember" && (
        <p
          role="status"
          className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-[#fbf3dc]/90 px-4 py-1.5 text-sm text-[#3a3026]"
        >
          Игроков видят участники сообщества
        </p>
      )}
      {feedState === "offline" && (
        <p
          role="status"
          className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-[#fbf3dc]/90 px-4 py-1.5 text-sm text-[#3a3026]"
        >
          Игроки сейчас не видны
        </p>
      )}

      {status === "empty" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"
        >
          <p className="max-w-sm rounded-lg bg-[#fbf3dc]/90 p-4 text-[#3a3026]">
            Карта откроется, когда игроки начнут исследовать мир.
          </p>
        </div>
      )}
      {status === "loading" && (
        <p
          role="status"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#fbf3dc]/90 px-4 py-1 text-sm text-[#3a3026]"
        >
          Загрузка карты…
        </p>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"
        >
          <div className="pointer-events-auto rounded-lg bg-[#fbf3dc]/95 p-4 text-[#3a3026]">
            <p className="mb-2">Не удалось загрузить карту.</p>
            <button
              type="button"
              className={tool + " w-auto px-4 text-base"}
              onClick={() => void refresh(true)}
            >
              Повторить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
