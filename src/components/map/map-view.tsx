"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./atlas.css";
import {
  DEFAULT_THEME,
  THEMES,
  themeById,
  themeVars,
  toolIcon,
  type AtlasTheme,
} from "./atlas-theme";
import {
  clampScale,
  panBy,
  REGION_BLOCKS,
  screenToWorld,
  visibleRegions,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import { PlayerFeed, type FeedState } from "./players";
import { drawPlayers } from "./render/players";

type Dim = "overworld" | "nether";
type Ref = { rx: number; rz: number; version: number };
type Loaded = { version: number; img: HTMLImageElement; used: number };
type Status = "loading" | "empty" | "ready" | "error";
type Overlay = "none" | "dims" | "themes";

const REFRESH_MS = 30_000;
const MAX_TILES = 48;
const THEME_KEY = "mineort.map.theme";
const DIM_NAMES: Record<Dim, string> = {
  overworld: "Верхний мир",
  nether: "Незер",
};
/** The scale bar picks the longest of these that fits in its room. */
const RULE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

function Panel({
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`atlas-panel ${className}`} {...rest}>
      <i className="atlas-stud tl" />
      <i className="atlas-stud tr" />
      <i className="atlas-stud bl" />
      <i className="atlas-stud br" />
      {children}
    </div>
  );
}

function ToolButton({
  theme,
  icon,
  label,
  pressed,
  onClick,
}: {
  theme: AtlasTheme;
  icon: string;
  label: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="atlas-btn"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={toolIcon(theme, icon)} alt="" draggable={false} />
    </button>
  );
}

export function MapView() {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: 256, z: 256, scale: 2 });
  const size = useRef<Viewport>({ width: 800, height: 500 });
  const tiles = useRef(new Map<string, Loaded>());
  const pending = useRef(new Set<string>());
  const index = useRef<Ref[]>([]);
  const bg = useRef<HTMLImageElement | null>(null);
  const queued = useRef(false);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const ruleBar = useRef<HTMLDivElement>(null);
  const ruleText = useRef<HTMLSpanElement>(null);
  const coords = useRef<HTMLDivElement>(null);

  const feed = useRef<PlayerFeed | null>(null);
  const easing = useRef(false);
  const [feedState, setFeedState] = useState<FeedState>("connecting");

  const [dim, setDim] = useState<Dim>("overworld");
  const [status, setStatus] = useState<Status>("loading");
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [theme, setTheme] = useState<AtlasTheme>(DEFAULT_THEME);
  const [showPlayers, setShowPlayers] = useState(true);
  const dimRef = useRef<Dim>("overworld");
  const themeRef = useRef<AtlasTheme>(DEFAULT_THEME);
  const playersRef = useRef(true);

  const paint = useCallback(() => {
    queued.current = false;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = size.current;
    const c = cam.current;
    const t = themeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // unexplored ground is bare parchment, which moves with the map
    if (bg.current?.complete && bg.current.naturalWidth) {
      const pattern = ctx.createPattern(bg.current, "repeat")!;
      pattern.setTransform(
        new DOMMatrix().translate(-c.x * c.scale, -c.z * c.scale).scale(2),
      );
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = t.cream;
    }
    ctx.fillRect(0, 0, width, height);

    const now = Date.now();
    for (const { rx, rz } of visibleRegions(c, size.current)) {
      const tile = tiles.current.get(`${dimRef.current}:${rx}:${rz}`);
      if (!tile) continue;
      tile.used = now;
      const [sx, sz] = worldToScreen(
        c,
        size.current,
        rx * REGION_BLOCKS,
        rz * REGION_BLOCKS,
      );
      const x0 = Math.floor(sx);
      const z0 = Math.floor(sz);
      const side = REGION_BLOCKS * c.scale;
      // whole-pixel edges, so neighbouring tiles meet without a seam
      ctx.drawImage(
        tile.img,
        x0,
        z0,
        Math.floor(sx + side) - x0,
        Math.floor(sz + side) - z0,
      );
    }

    // a faint chunk grid once the blocks are big enough to count
    if (c.scale >= 3) {
      ctx.fillStyle = `${t.ink}${c.scale >= 6 ? "22" : "16"}`;
      const [wx0, wz0] = screenToWorld(c, size.current, 0, 0);
      const [wx1, wz1] = screenToWorld(c, size.current, width, height);
      for (let bx = Math.floor(wx0 / 16) * 16; bx < wx1; bx += 16) {
        const px = Math.round(worldToScreen(c, size.current, bx, 0)[0]);
        ctx.fillRect(px, 0, 1, height);
      }
      for (let bz = Math.floor(wz0 / 16) * 16; bz < wz1; bz += 16) {
        const pz = Math.round(worldToScreen(c, size.current, 0, bz)[1]);
        ctx.fillRect(0, pz, width, 1);
      }
    }

    if (feed.current && playersRef.current)
      drawPlayers(
        ctx,
        c,
        size.current,
        feed.current.dots.values(),
        dimRef.current,
        feed.current.staff,
        {
          ink: t.ink,
          cream: t.cream,
          family: getComputedStyle(el).fontFamily,
        },
      );

    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.5,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.8,
    );
    vignette.addColorStop(0, `${t.vignette}00`);
    vignette.addColorStop(1, `${t.vignette}55`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // scale bar: the longest round distance that fits in 150 pixels
    const blocks =
      [...RULE_STEPS].reverse().find((s) => s * c.scale <= 150) ??
      RULE_STEPS[0];
    if (ruleBar.current) ruleBar.current.style.width = `${blocks * c.scale}px`;
    if (ruleText.current) ruleText.current.textContent = `${blocks} бл.`;
    if (coords.current)
      coords.current.hidden = !feed.current?.staff || !coords.current.textContent;
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

  /** Fetches the tiles near the screen that are missing or out of date. */
  const loadVisible = useCallback(() => {
    const d = dimRef.current;
    const byKey = new Map(index.current.map((r) => [`${r.rx}:${r.rz}`, r]));
    for (const { rx, rz } of visibleRegions(cam.current, size.current, 320)) {
      const region = byKey.get(`${rx}:${rz}`);
      if (!region) continue;
      const key = `${d}:${rx}:${rz}`;
      const loaded = tiles.current.get(key);
      const wanted = `${key}:${region.version}`;
      if (loaded?.version === region.version || pending.current.has(wanted))
        continue;
      pending.current.add(wanted);
      const img = new Image();
      img.onload = () => {
        pending.current.delete(wanted);
        tiles.current.set(key, {
          version: region.version,
          img,
          used: Date.now(),
        });
        if (tiles.current.size > MAX_TILES) {
          const oldest = [...tiles.current.entries()].sort(
            (a, b) => a[1].used - b[1].used,
          )[0];
          tiles.current.delete(oldest[0]);
        }
        requestPaint();
      };
      img.onerror = () => pending.current.delete(wanted);
      img.src = `/api/map/tile?dim=${d}&rx=${rx}&rz=${rz}&v=${region.version}`;
    }
  }, [requestPaint]);

  /** Puts the whole explored world on the screen. */
  const fit = useCallback(() => {
    if (index.current.length === 0) return;
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
      scale: clampScale(Math.min(2, 0.9 / span)),
    };
    loadVisible();
    requestPaint();
  }, [loadVisible, requestPaint]);

  const refresh = useCallback(
    async (first: boolean) => {
      try {
        const res = await fetch(`/api/map/regions?dim=${dimRef.current}`);
        if (!res.ok) throw new Error(`index ${res.status}`);
        index.current = ((await res.json()) as { regions: Ref[] }).regions;
        if (index.current.length === 0) {
          setStatus("empty");
          requestPaint();
          return;
        }
        setStatus("ready");
        if (first) fit();
        else loadVisible();
      } catch {
        setStatus("error");
      }
    },
    [fit, loadVisible, requestPaint],
  );

  const scheduleLoad = useCallback(() => {
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(loadVisible, 120);
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

  // the saved design, read after the first paint so the server and the browser agree on the markup
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        setTheme(themeById(localStorage.getItem(THEME_KEY)));
      } catch {
        /* storage can be blocked; the default design stays */
      }
    }, 0);
    return () => clearTimeout(read);
  }, []);

  // the parchment of the chosen design is the ground of the canvas
  useEffect(() => {
    themeRef.current = theme;
    const img = new Image();
    img.onload = () => {
      bg.current = img;
      requestPaint();
    };
    img.src = theme.panel;
    requestPaint();
  }, [theme, requestPaint]);

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
        e.deltaY < 0 ? 1.25 : 0.8,
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
    const r = e.currentTarget.getBoundingClientRect();
    if (coords.current && feed.current?.staff) {
      const [wx, wz] = screenToWorld(
        cam.current,
        size.current,
        e.clientX - r.left,
        e.clientY - r.top,
      );
      coords.current.textContent = `X ${Math.round(wx)}  Z ${Math.round(wz)}`;
      coords.current.hidden = false;
    }
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const all = [...pointers.current.values()];
    if (all.length === 1) {
      cam.current = panBy(cam.current, e.clientX - prev.x, e.clientY - prev.y);
    } else if (all.length === 2) {
      const d = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      if (pinch.current) {
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
      zoomBy(1.5);
      return;
    } else if (e.key === "-") {
      zoomBy(1 / 1.5);
      return;
    } else return;
    e.preventDefault();
    requestPaint();
    scheduleLoad();
  };

  const chooseTheme = (t: AtlasTheme) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t.id);
    } catch {
      /* the choice then lasts until the page is closed */
    }
  };
  const toggleOverlay = (o: Overlay) =>
    setOverlay((cur) => (cur === o ? "none" : o));

  return (
    <div
      ref={frame}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={themeVars(theme)}
      data-ornate={theme.ornate}
      className="atlas relative h-[72dvh] min-h-[440px] touch-none overflow-hidden border-2 border-(--ink)"
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label="Карта мира. Перетаскивайте, чтобы двигать, колесо мыши или кнопки плюс и минус, чтобы менять масштаб."
        className="absolute inset-0 size-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <Panel className="atlas-plaque absolute top-3 left-1/2 -translate-x-1/2">
        Мир MineOrt &nbsp;·&nbsp; {DIM_NAMES[dim]}
      </Panel>

      <Panel
        className="absolute top-3 left-3 flex flex-col gap-1.5 p-1.5"
        role="toolbar"
        aria-label="Инструменты карты"
        aria-orientation="vertical"
      >
        <ToolButton
          theme={theme}
          icon="map"
          label="Показать весь мир"
          onClick={fit}
        />
        <ToolButton
          theme={theme}
          icon={showPlayers ? "eye" : "eye_off"}
          label={showPlayers ? "Скрыть игроков" : "Показать игроков"}
          pressed={!showPlayers}
          onClick={() => {
            playersRef.current = !showPlayers;
            setShowPlayers(!showPlayers);
            requestPaint();
          }}
        />
        <ToolButton
          theme={theme}
          icon="zoom_in"
          label="Приблизить"
          onClick={() => zoomBy(1.5)}
        />
        <ToolButton
          theme={theme}
          icon="zoom_out"
          label="Отдалить"
          onClick={() => zoomBy(1 / 1.5)}
        />
        <ToolButton
          theme={theme}
          icon="globe"
          label="Измерение"
          pressed={overlay === "dims"}
          onClick={() => toggleOverlay("dims")}
        />
        <ToolButton
          theme={theme}
          icon="gear"
          label="Оформление"
          pressed={overlay === "themes"}
          onClick={() => toggleOverlay("themes")}
        />
      </Panel>

      {overlay === "dims" && (
        <Panel
          className="absolute top-3 left-[72px] flex flex-col gap-1.5 p-2"
          role="group"
          aria-label="Измерение"
        >
          {(["overworld", "nether"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className="atlas-label-btn"
              aria-pressed={dim === d}
              onClick={() => {
                if (d !== dim) {
                  setStatus("loading");
                  setDim(d);
                }
                setOverlay("none");
              }}
            >
              {DIM_NAMES[d]}
            </button>
          ))}
        </Panel>
      )}

      {overlay === "themes" && (
        <Panel
          className="absolute top-3 left-[72px] grid grid-cols-2 gap-1.5 p-2"
          role="group"
          aria-label="Оформление"
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="atlas-label-btn"
              aria-pressed={theme.id === t.id}
              onClick={() => chooseTheme(t)}
            >
              {t.name}
            </button>
          ))}
        </Panel>
      )}

      <Panel className="absolute bottom-3 left-3 flex flex-col gap-1 px-2.5 py-1.5 text-xs">
        <div ref={coords} hidden aria-live="off" />
        <div className="flex items-center gap-2">
          <div ref={ruleBar} className="atlas-rule" style={{ width: 100 }} />
          <span ref={ruleText}>50 бл.</span>
        </div>
      </Panel>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/map/ui/compass.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute right-3 bottom-3 size-16 opacity-90"
      />

      {feedState === "guest" && (
        <a
          href="/api/auth/telegram/start?return_to=/map"
          className="atlas-label-btn absolute right-24 bottom-4"
        >
          Войдите, чтобы видеть игроков
        </a>
      )}
      {feedState === "nonmember" && (
        <Panel
          role="status"
          className="atlas-status pointer-events-none absolute right-24 bottom-4"
        >
          Игроков видят участники сообщества
        </Panel>
      )}
      {feedState === "offline" && (
        <Panel
          role="status"
          className="atlas-status pointer-events-none absolute right-24 bottom-4"
        >
          Игроки сейчас не видны
        </Panel>
      )}

      {status === "empty" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"
        >
          <Panel className="max-w-sm p-4 text-sm">
            Карта откроется, когда игроки начнут исследовать мир.
          </Panel>
        </div>
      )}
      {status === "loading" && (
        <Panel
          role="status"
          className="atlas-status absolute bottom-4 left-1/2 -translate-x-1/2"
        >
          Загрузка карты…
        </Panel>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center"
        >
          <Panel className="pointer-events-auto p-4 text-sm">
            <p className="mb-3">Не удалось загрузить карту.</p>
            <button
              type="button"
              className="atlas-label-btn"
              onClick={() => void refresh(true)}
            >
              Повторить
            </button>
          </Panel>
        </div>
      )}
    </div>
  );
}
