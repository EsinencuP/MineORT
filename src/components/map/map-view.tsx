"use client";

// The full-screen map, laid out and drawn like the map screen of AtlasMap by erkinpaw (MIT,
// https://github.com/erkinpaw/atlasmap, MapScreen.java and MapView.java). Every size is in the mod's
// GUI pixels; `g` is one GUI pixel on screen. Copyright (c) 2026 erkinpaw for the ported design.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "./atlas.css";
import { IconButton, Panel, TB } from "./atlas-ui";
import {
  DEFAULT_THEME,
  THEMES,
  themeById,
  themeVars,
  toolIcon,
  type AtlasTheme,
} from "./atlas-theme";
import {
  panBy,
  REGION_BLOCKS,
  screenToWorld,
  visibleRegions,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from "./camera";
import {
  dashedLine,
  distanceTo,
  DRAW_TOOLS,
  drawLabel,
  drawStroke,
  fmtDistance,
  loadStrokes,
  PALETTE,
  RED,
  saveStrokes,
  WIDTHS,
  type DrawTool,
  type Stroke,
} from "./drawing";
import {
  ColorPicker,
  IconPicker,
  MarkerCard,
  MarkerEditor,
  MarkerList,
  ReportDialog,
  SORTS,
  sortMarkers,
  type Draft,
  type SortId,
} from "./markers";
import { PlayerFeed, type FeedState } from "./players";
import {
  drawBoundary,
  drawMarkerPath,
  drawMarkers,
  markerAt,
  markerPoint,
  type MapMarker,
} from "./render/markers";
import { drawPlayers } from "./render/players";
import { TrailLayer } from "./render/trails";
import { MAX_VERTICES, validPolygon, type Vertex } from "@/lib/map/polygon";
import type { TrailHistory, TrailPoint } from "@/lib/map/trail-geometry";
import {
  MAX_ROUTE_POINTS,
  routeLength,
  validRoutePoints,
} from "@/lib/map/route-geometry";

type Dim = "overworld" | "nether";
type Ref = { rx: number; rz: number; version: number };
type Loaded = { version: number; img: HTMLImageElement; used: number };
type Status = "loading" | "empty" | "ready" | "error";
type Overlay =
  | "none"
  | "dims"
  | "settings"
  | "confirm"
  | "icons"
  | "colors"
  | "report"
  | "delete-marker";
type Me = {
  signedIn: boolean;
  canCreate: boolean;
  canLabel: boolean;
  canModerate: boolean;
  inGuild: boolean;
};
type Tool = "none" | "ruler" | "draw" | "marker" | "route";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 16;
const REFRESH_MS = 30_000;
const TRAILS_REFRESH_MS = 15_000;
const MAX_TILES = 48;
const AREA_CLOSE_RADIUS = 8;
const THEME_KEY = "mineort.map.theme";
const PREFS_KEY = "mineort.map.prefs";
const HIDDEN_KEY = "mineort.map.hiddenMarkers";
const NO_ONE: Me = {
  signedIn: false,
  canCreate: false,
  canLabel: false,
  canModerate: false,
  inGuild: false,
};
const DIM_NAMES: Record<Dim, string> = {
  overworld: "Верхний мир",
  nether: "Незер",
};
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

/** Minecraft's GUI scale for this window: 3 on a large screen, 2 on a usual one, 1.5 on a phone. */
const guiScale = (w: number, h: number) =>
  w >= 1600 && h >= 900 ? 3 : w >= 640 ? 2 : 1.5;

const px = (n: number) => `${n}px`;

export function MapView({
  backHref = "/",
  hasCollections = false,
}: {
  backHref?: string;
  hasCollections?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: 256, z: 256, scale: 4 });
  const size = useRef<Viewport>({ width: 800, height: 500 });
  const gRef = useRef(2);
  const tiles = useRef(new Map<string, Loaded>());
  const pending = useRef(new Set<string>());
  const index = useRef<Ref[]>([]);
  const indexKey = useRef("");
  const indexRequest = useRef<AbortController | null>(null);
  const anchor = useRef<{ dim: Dim; rx: number; rz: number } | null>(null);
  const bg = useRef<HTMLImageElement | null>(null);
  const arrow = useRef<HTMLImageElement | null>(null);
  const queued = useRef(false);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const feed = useRef<PlayerFeed | null>(null);
  const trails = useRef<TrailLayer | null>(null);
  const easing = useRef(false);
  const [feedState, setFeedState] = useState<FeedState>("connecting");
  const [staff, setStaff] = useState(false);

  const [g, setG] = useState(2);
  const [width, setWidth] = useState(800);
  const [dim, setDim] = useState<Dim>("overworld");
  const [status, setStatus] = useState<Status>("loading");
  const [markersUnavailable, setMarkersUnavailable] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [theme, setTheme] = useState<AtlasTheme>(DEFAULT_THEME);
  const [tool, setToolState] = useState<Tool>("none");
  const [drawTool, setDrawTool] = useState<DrawTool>("pen");
  const [colorIdx, setColorIdx] = useState(20);
  const [widthIdx, setWidthIdx] = useState(1);
  const [prefs, setPrefs] = useState({
    players: true,
    drawings: true,
    markers: true,
  });
  const [scaleInfo, setScaleInfo] = useState({ px: 40, blocks: 20 });
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [rulerText, setRulerText] = useState<string[]>([]);

  const dimRef = useRef<Dim>("overworld");
  const themeRef = useRef<AtlasTheme>(DEFAULT_THEME);
  const prefsRef = useRef(prefs);
  const toolRef = useRef<Tool>("none");
  const drawRef = useRef({
    tool: "pen" as DrawTool,
    color: PALETTE[20],
    width: 2,
  });
  const strokes = useRef(new Map<string, Stroke[]>());
  const current = useRef<Stroke | null>(null);
  const erased = useRef<Stroke[] | null>(null);
  const undo = useRef<(() => void)[]>([]);
  const ruler = useRef<[number, number][]>([]);
  const [routePoints, setRoutePoints] = useState<TrailPoint[]>([]);
  const routePointsRef = useRef<TrailPoint[]>([]);
  const draggedRoutePoint = useRef<number | null>(null);
  const mouse = useRef<[number, number] | null>(null);

  // markers
  const [markers, setMarkersState] = useState<MapMarker[]>([]);
  const markersRevision = useRef(0);
  const [me, setMe] = useState<Me>(NO_ONE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "view" | "edit">("none");
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [areaEdit, setAreaEdit] = useState(false);
  const [areaPoints, setAreaPoints] = useState<Vertex[]>([]);
  const [areaError, setAreaError] = useState("");
  const [movingVertex, setMovingVertex] = useState<number | null>(null);
  const areaEditRef = useRef(false);
  const areaPointsRef = useRef<Vertex[]>([]);
  const [areaHistory, setAreaHistory] = useState<Vertex[][]>([]);
  const focusedArea = useRef<string | null>(null);
  const touchedArea = useRef<string | null>(null);
  const areaLabels = useRef(new Map<string, HTMLButtonElement>());
  const [listOpen, setListOpen] = useState(false);
  const [sort, setSort] = useState<SortId>("name");
  const [query, setQuery] = useState("");
  const [hidden, setHiddenState] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [markerError, setMarkerError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [colorFor, setColorFor] = useState<string | null>(null);
  const markersRef = useRef<MapMarker[]>([]);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const hiddenRef = useRef<Set<string>>(new Set());
  const draftRef = useRef<Draft | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const requestPaintRef = useRef<() => void>(() => {});
  // the middle of the view, for distances in the marker list; kept in state so the list re-renders
  const [viewMid, setViewMid] = useState<[number, number]>([0, 0]);

  const strokesOf = useCallback((d: Dim) => {
    let list = strokes.current.get(d);
    if (!list) {
      list = loadStrokes(d);
      strokes.current.set(d, list);
    }
    return list;
  }, []);

  const paint = useCallback(() => {
    queued.current = false;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const { width: w, height: h } = size.current;
    const c = cam.current;
    const t = themeRef.current;
    const gp = gRef.current;
    const zoom = c.scale / gp;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // MapView.drawBackground: the theme's sheet, one texel per GUI pixel, moving with the map
    if (bg.current?.complete && bg.current.naturalWidth) {
      const pattern = ctx.createPattern(bg.current, "repeat")!;
      pattern.setTransform(
        new DOMMatrix().translate(-c.x * c.scale, -c.z * c.scale).scale(gp),
      );
      ctx.fillStyle = pattern;
    } else {
      ctx.fillStyle = t.cream;
    }
    ctx.fillRect(0, 0, w, h);

    // MapView.drawTiles: one pixel per block, sharp when a block is a pixel or more on screen and
    // averaged when it is smaller, so a far view stays calm instead of shimmering
    const smooth = c.scale * dpr < 1;
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = "high";
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
      const snap = (v: number) => Math.round(v * dpr) / dpr;
      const x0 = snap(sx);
      const z0 = snap(sz);
      const side = REGION_BLOCKS * c.scale;
      ctx.drawImage(
        tile.img,
        x0,
        z0,
        snap(sx + side) - x0,
        snap(sz + side) - z0,
      );
    }
    ctx.imageSmoothingEnabled = false;

    // MapView.drawGrid: a faint chunk grid from zoom 3
    if (zoom >= 3) {
      ctx.fillStyle = t.ink + (zoom >= 6 ? "22" : "16");
      const [wx0, wz0] = screenToWorld(c, size.current, 0, 0);
      const [wx1, wz1] = screenToWorld(c, size.current, w, h);
      for (let bx = Math.floor(wx0 / 16) * 16; bx < wx1; bx += 16) {
        const p = Math.round(worldToScreen(c, size.current, bx, 0)[0]);
        ctx.fillRect(p, 0, gp, h);
      }
      for (let bz = Math.floor(wz0 / 16) * 16; bz < wz1; bz += 16) {
        const p = Math.round(worldToScreen(c, size.current, 0, bz)[1]);
        ctx.fillRect(0, p, w, gp);
      }
    }

    // MapScreen.vignette: ten bands of two GUI pixels on each edge
    for (let i = 0; i < 10; i++) {
      const a = ((10 - i) * 7) / 255;
      ctx.fillStyle = `${t.vignette}${Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")}`;
      const b = 2 * gp;
      ctx.fillRect(0, i * b, w, b);
      ctx.fillRect(0, h - i * b - b, w, b);
      ctx.fillRect(i * b, 0, b, h);
      ctx.fillRect(w - i * b - b, 0, b, h);
    }

    if (prefsRef.current.players && trails.current?.dim === dimRef.current)
      trails.current.draw(ctx, c, size.current, {
        own: t.accent,
        peer: t.ink,
      });

    const tl = toolRef.current;
    if (prefsRef.current.drawings || tl === "draw") {
      for (const s of strokesOf(dimRef.current))
        drawStroke(ctx, c, size.current, s, gp);
    }
    if (current.current) drawStroke(ctx, c, size.current, current.current, gp);
    if (tl === "draw" && drawRef.current.tool === "eraser" && mouse.current) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = gp;
      const [mx, my] = mouse.current;
      ctx.strokeRect(
        mx - 6 * gp + gp / 2,
        my - 6 * gp + gp / 2,
        11 * gp,
        11 * gp,
      );
    }

    ctx.font = `${10.5 * gp}px ${getComputedStyle(el).fontFamily}`;
    const colors = { cream: t.cream, ink: t.ink };

    // MapScreen.drawRuler
    const pts = ruler.current;
    if (pts.length) {
      const sp = pts.map((p) => worldToScreen(c, size.current, p[0], p[1]));
      for (let i = 0; i + 1 < sp.length; i++)
        dashedLine(ctx, sp[i], sp[i + 1], 2 * gp, RED, 5 * gp);
      const live = tl === "ruler" && mouse.current;
      if (live)
        dashedLine(
          ctx,
          sp[sp.length - 1],
          mouse.current!,
          1.5 * gp,
          RED + "b0",
          4 * gp,
        );
      for (const [x, y] of sp) {
        ctx.fillStyle = t.ink;
        ctx.fillRect(x - 3.5 * gp, y - 3.5 * gp, 7 * gp, 7 * gp);
        ctx.fillStyle = t.accentLight;
        ctx.fillRect(x - 2 * gp, y - 2 * gp, 4 * gp, 4 * gp);
      }
      for (let i = 0; i + 1 < pts.length; i++) {
        const d = Math.hypot(
          pts[i + 1][0] - pts[i][0],
          pts[i + 1][1] - pts[i][1],
        );
        drawLabel(
          ctx,
          `${fmtDistance(d)} бл.`,
          (sp[i][0] + sp[i + 1][0]) / 2,
          (sp[i][1] + sp[i + 1][1]) / 2,
          gp,
          colors,
        );
      }
      if (live) {
        const [mx, my] = mouse.current!;
        const [wx, wz] = screenToWorld(c, size.current, mx, my);
        const last = pts[pts.length - 1];
        drawLabel(
          ctx,
          fmtDistance(Math.hypot(wx - last[0], wz - last[1])),
          mx + 12 * gp,
          my + 10 * gp,
          gp,
          colors,
        );
      }
    }

    // MapView.drawMarkers: the markers of this dimension that are not hidden; the selected one always
    const sel = selectedRef.current;
    const d0 = draftRef.current;
    const shown = markersRef.current.filter(
      (m) =>
        m.dim === dimRef.current &&
        m.id !== d0?.id &&
        (m.id === sel ||
          (prefsRef.current.markers && !hiddenRef.current.has(m.id))),
    );
    if (d0 && d0.dim === dimRef.current)
      shown.push({
        ...d0,
        geometry: d0.routePoints ? [d0.routePoints] : d0.geometry,
        id: d0.id ?? "draft",
        status: "approved",
        author: "",
        mine: true,
        canEdit: true,
        canDelete: true,
        createdAt: "",
      });
    const activeArea =
      focusedArea.current ?? hoveredRef.current ?? touchedArea.current;
    for (const m of shown) {
      const label = areaLabels.current.get(m.id);
      if (!label) continue;
      const [left, top] = markerPoint(c, size.current, m);
      label.style.left = px(left);
      label.style.top = px(top);
      label.hidden =
        left < 0 ||
        top < 0 ||
        left > size.current.width ||
        top > size.current.height;
    }
    const boundary =
      (d0?.dim === dimRef.current ? d0.boundary : null) ??
      shown.find((m) => m.id === activeArea)?.boundary ??
      shown.find((m) => m.id === sel)?.boundary;
    if (boundary && !areaEditRef.current)
      drawBoundary(ctx, c, size.current, boundary, t.accent, true);
    if (areaEditRef.current)
      drawBoundary(
        ctx,
        c,
        size.current,
        areaPointsRef.current,
        t.accent,
        false,
        true,
      );
    for (const marker of shown) {
      if (marker.geometry)
        drawMarkerPath(
          ctx,
          c,
          size.current,
          marker.geometry,
          marker.color ?? t.accent,
        );
    }
    if (tl === "route")
      drawMarkerPath(
        ctx,
        c,
        size.current,
        [routePointsRef.current],
        t.accent,
        true,
      );
    drawMarkers(ctx, c, size.current, shown, {
      g: gp,
      family: getComputedStyle(el).fontFamily,
      selected: d0 ? (d0.id ?? "draft") : sel,
      hovered: hoveredRef.current,
      colors: {
        ink: t.ink,
        inkSoft: t.inkSoft,
        cream: t.cream,
        gold: t.accent,
        goldLight: t.accentLight,
      },
      onLoad: () => requestPaintRef.current(),
    });

    if (feed.current && prefsRef.current.players)
      drawPlayers(
        ctx,
        c,
        size.current,
        feed.current.dots.values(),
        dimRef.current,
        feed.current.staff,
        { ink: t.ink, cream: t.cream, g: gp, arrow: arrow.current },
      );
  }, [strokesOf]);

  const requestPaint = useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    requestAnimationFrame(paint);
  }, [paint]);
  useEffect(() => {
    requestPaintRef.current = requestPaint;
  }, [requestPaint]);

  /** The status bar follows the zoom: the shortest round distance at least 40 GUI pixels long. */
  const syncScale = useCallback(() => {
    const zoom = cam.current.scale / gRef.current;
    const blocks = NICE.find((n) => n * zoom >= 40) ?? NICE[NICE.length - 1];
    setScaleInfo((s) =>
      s.blocks === blocks && s.px === Math.round(blocks * zoom)
        ? s
        : { blocks, px: Math.round(blocks * zoom) },
    );
  }, []);

  /** Keeps painting while a dot is still gliding to its new position. */
  const glide = useCallback(() => {
    if (feed.current) setStaff(feed.current.staff);
    const layer = trails.current;
    if (layer?.nickname) layer.observe(feed.current?.dots.get(layer.nickname));
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
      const wanted = `${key}:${region.version}`;
      if (
        tiles.current.get(key)?.version === region.version ||
        pending.current.has(wanted)
      )
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

  const refreshRegions = useCallback(
    async (force = false) => {
      const ranges = visibleRegions(cam.current, size.current, 320);
      const low = ranges[0];
      const high = ranges.at(-1)!;
      const params = new URLSearchParams({
        dim: dimRef.current,
        minX: String(low.rx),
        minZ: String(low.rz),
        maxX: String(high.rx),
        maxZ: String(high.rz),
      });
      const key = params.toString();
      if (!force && indexKey.current === key) {
        loadVisible();
        return;
      }
      indexKey.current = key;
      indexRequest.current?.abort();
      const controller = new AbortController();
      indexRequest.current = controller;
      try {
        const res = await fetch(`/api/map/regions?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`index ${res.status}`);
        const data = (await res.json()) as { regions: Ref[] };
        if (controller.signal.aborted) return;
        index.current = data.regions;
        setStatus(data.regions.length || anchor.current ? "ready" : "empty");
        loadVisible();
        requestPaint();
      } catch {
        if (controller.signal.aborted) return;
        indexKey.current = "";
        setStatus("error");
      }
    },
    [loadVisible, requestPaint],
  );

  const moved = useCallback(() => {
    requestPaint();
    syncScale();
    const mid: [number, number] = [
      Math.round(cam.current.x / 8) * 8,
      Math.round(cam.current.z / 8) * 8,
    ];
    setViewMid((v) => (v[0] === mid[0] && v[1] === mid[1] ? v : mid));
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => void refreshRegions(), 120);
  }, [requestPaint, syncScale, refreshRegions]);

  const zoomBy = useCallback(
    (factor: number, sx?: number, sz?: number) => {
      const gp = gRef.current;
      cam.current = zoomAt(
        cam.current,
        size.current,
        sx ?? size.current.width / 2,
        sz ?? size.current.height / 2,
        factor,
        MIN_ZOOM * gp,
        MAX_ZOOM * gp,
      );
      moved();
    },
    [moved],
  );

  /** Puts the middle of the explored world on screen at the mod's starting zoom. */
  const center = useCallback(() => {
    const middle = anchor.current;
    if (middle?.dim !== dimRef.current) return;
    cam.current = {
      x: (middle.rx + 0.5) * REGION_BLOCKS,
      z: (middle.rz + 0.5) * REGION_BLOCKS,
      scale: 2 * gRef.current,
    };
    moved();
  }, [moved]);

  /** The markers of the current dimension that this viewer may see. */
  const loadMarkers = useCallback(
    async (dimension: Dim, signal?: AbortSignal) => {
      const revision = markersRevision.current;
      try {
        const res = await fetch(`/api/map/markers?dim=${dimension}`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) throw new Error(`markers ${res.status}`);
        const body = (await res.json()) as { markers: MapMarker[]; me: Me };
        if (signal?.aborted || dimension !== dimRef.current) return;
        setMe(body.me);
        setMarkersUnavailable(false);
        if (revision !== markersRevision.current) return;
        markersRef.current = body.markers;
        setMarkersState(body.markers);
        requestPaint();
      } catch {
        if (!signal?.aborted && dimension === dimRef.current)
          setMarkersUnavailable(true);
      }
    },
    [requestPaint],
  );

  const refresh = useCallback(
    async (first: boolean, signal?: AbortSignal) => {
      const dimension = dimRef.current;
      void loadMarkers(dimension, signal);
      try {
        const res = await fetch(`/api/map/regions?dim=${dimension}&anchor=1`, {
          signal,
        });
        if (!res.ok) throw new Error(`map extent ${res.status}`);
        const { anchor: middle } = (await res.json()) as {
          anchor: { rx: number; rz: number } | null;
        };
        if (signal?.aborted || dimension !== dimRef.current) return;
        anchor.current = middle ? { ...middle, dim: dimension } : null;
        if (first && !new URLSearchParams(location.search).has("m")) center();
      } catch {
        // A failed extent lookup must still allow the current viewport to load.
      }
      if (!signal?.aborted && dimension === dimRef.current)
        await refreshRegions(true);
    },
    [center, loadMarkers, refreshRegions],
  );

  const changeRoute = (points: TrailPoint[]) => {
    routePointsRef.current = points;
    setRoutePoints(points);
    requestPaint();
  };

  const setTool = (t: Tool) => {
    if (toolRef.current === "route" && t !== "route") {
      draggedRoutePoint.current = null;
      changeRoute([]);
    }
    toolRef.current = t;
    setToolState(t);
    current.current = null;
    if (t !== "ruler") {
      ruler.current = [];
      setRulerText([]);
    }
    requestPaint();
  };

  const updateRuler = () => {
    const p = ruler.current;
    if (p.length === 0) return setRulerText([]);
    let total = 0;
    for (let i = 0; i + 1 < p.length; i++)
      total += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    let first = `Длина: ${fmtDistance(total)} бл. · точек: ${p.length}`;
    if (p.length >= 2) {
      const a = p[0];
      const b = p[p.length - 1];
      first += `   Напрямую: ${fmtDistance(Math.hypot(b[0] - a[0], b[1] - a[1]))} (ΔX ${Math.round(b[0] - a[0])}, ΔZ ${Math.round(b[1] - a[1])})`;
    }
    setRulerText([first]);
  };

  const commitStrokes = () =>
    saveStrokes(dimRef.current, strokesOf(dimRef.current));

  const doUndo = () => {
    const r = undo.current.pop();
    if (r) {
      r();
      commitStrokes();
      requestPaint();
    }
  };

  const clearDrawings = () => {
    const list = strokesOf(dimRef.current);
    const copy = [...list];
    list.length = 0;
    undo.current.push(() => list.push(...copy));
    commitStrokes();
    requestPaint();
  };

  const savePrefs = (p: typeof prefs) => {
    prefsRef.current = p;
    setPrefs(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      /* kept until the page closes */
    }
    requestPaint();
  };

  const chooseTheme = (t: AtlasTheme) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t.id);
    } catch {
      /* kept until the page closes */
    }
  };

  // size the canvas and the GUI scale to the window
  useEffect(() => {
    const el = root.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width: w, height: h } = el.getBoundingClientRect();
      const nextG = guiScale(w, h);
      if (nextG !== gRef.current) {
        cam.current = {
          ...cam.current,
          scale: (cam.current.scale / gRef.current) * nextG,
        };
        gRef.current = nextG;
      }
      setG(nextG);
      setWidth(w);
      size.current = { width: w, height: h };
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      moved();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [moved]);

  // the page under the map does not scroll while the map is open
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

  // first load, a change of dimension, and a refresh every half minute
  useEffect(() => {
    dimRef.current = dim;
    index.current = [];
    indexKey.current = "";
    anchor.current = null;
    const controller = new AbortController();
    const first = setTimeout(() => void refresh(true, controller.signal), 0);
    const timer = setInterval(
      () => void refresh(false, controller.signal),
      REFRESH_MS,
    );
    return () => {
      controller.abort();
      indexRequest.current?.abort();
      clearTimeout(first);
      clearInterval(timer);
      clearTimeout(fetchTimer.current);
    };
  }, [dim, refresh]);

  // saved choices, read after the first paint so the server and the browser agree on the markup
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        setTheme(themeById(localStorage.getItem(THEME_KEY)));
        const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
        if (
          p &&
          typeof p.players === "boolean" &&
          typeof p.drawings === "boolean"
        ) {
          const next = { markers: true, ...p };
          prefsRef.current = next;
          setPrefs(next);
        }
        const h = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
        if (Array.isArray(h)) {
          const set = new Set<string>(h.filter((x) => typeof x === "string"));
          hiddenRef.current = set;
          setHiddenState(set);
        }
      } catch {
        /* storage can be blocked; the defaults stay */
      }
    }, 0);
    return () => clearTimeout(read);
  }, []);

  // the chosen design's sheet is the ground of the map, its arrow marks the players
  useEffect(() => {
    themeRef.current = theme;
    const sheet = new Image();
    sheet.onload = () => {
      bg.current = sheet;
      requestPaint();
    };
    sheet.src = theme.panel;
    const a = new Image();
    a.onload = () => {
      arrow.current = a;
      requestPaint();
    };
    a.src = toolIcon(theme, "arrow");
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

  useEffect(() => {
    if (!me.signedIn || !prefs.players) return;
    const controller = new AbortController();
    const layer = new TrailLayer(dim);
    let timer: ReturnType<typeof setTimeout>;
    async function refreshTrails() {
      try {
        const response = await fetch(`/api/map/trails?dim=${dim}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const history = (await response.json()) as TrailHistory;
        if (controller.signal.aborted) return;
        layer.replace(history);
        if (layer.nickname)
          layer.observe(feed.current?.dots.get(layer.nickname));
        trails.current = layer;
      } catch {
        if (controller.signal.aborted) return;
        if (trails.current === layer) trails.current = null;
      }
      requestPaint();
      timer = setTimeout(() => void refreshTrails(), TRAILS_REFRESH_MS);
    }
    void refreshTrails();
    return () => {
      controller.abort();
      clearTimeout(timer);
      if (trails.current === layer) trails.current = null;
      requestPaint();
    };
  }, [dim, me.signedIn, prefs.players, requestPaint]);

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const notches =
        Math.max(-3, Math.min(3, -e.deltaY / 100)) || (e.deltaY < 0 ? 1 : -1);
      zoomBy(Math.pow(1.2, notches), e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // ------------------------------------------------------------------ markers

  const setMarkers = (list: MapMarker[]) => {
    markersRevision.current++;
    markersRef.current = list;
    setMarkersState(list);
    requestPaint();
  };
  const select = (id: string | null) => {
    selectedRef.current = id;
    setSelectedId(id);
    requestPaint();
  };
  const setDraft = (d: Draft | null) => {
    draftRef.current = d;
    setDraftState(d);
    requestPaint();
  };
  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3500);
  };
  const closePanel = () => {
    setPanel("none");
    setDraft(null);
    select(null);
    setMarkerError(null);
  };

  /** MapScreen.openView: the card of a marker, the map centred on it when asked. */
  const openView = (m: MapMarker, centre: boolean) => {
    setDraft(null);
    setMarkerError(null);
    select(m.id);
    setPanel("view");
    if (size.current.width / gRef.current < 420) setListOpen(false);
    if (centre) {
      if (m.dim !== dimRef.current) {
        setStatus("loading");
        setDim(m.dim);
      }
      cam.current = { ...cam.current, x: m.x + 0.5, z: m.z + 0.5 };
      moved();
    }
  };

  /** Opens the editor for a new marker at the chosen world position. */
  const startMarker = (
    wx: number,
    wz: number,
    options?: Pick<Draft, "kind" | "routePoints">,
  ) => {
    if (!me.canCreate) {
      flash(
        me.signedIn
          ? "Метки ставят участники сервера."
          : "Войдите, чтобы ставить метки.",
      );
      return;
    }
    if (toolRef.current === "marker" || toolRef.current === "route")
      setTool("none");
    select(null);
    setMarkerError(null);
    setDraft({
      id: null,
      kind: options?.kind ?? "point",
      routePoints: options?.routePoints,
      dim: dimRef.current,
      x: Math.floor(wx),
      z: Math.floor(wz),
      y: null,
      name: `${options?.kind === "route" ? "Маршрут" : options?.kind === "path" ? "Путь" : "Метка"} ${markersRef.current.filter((m) => m.mine).length + 1}`,
      description: "",
      icon: "pin",
      color: null,
      visibility: "private",
    });
    setPanel("edit");
  };

  const finishRoute = () => {
    const points = routePointsRef.current;
    if (!validRoutePoints(points)) {
      flash("Укажите минимум две разные соседние точки маршрута.");
      return;
    }
    startMarker(...points[0], { kind: "route", routePoints: points });
  };

  const editMarker = (m: MapMarker) => {
    setMarkerError(null);
    setDraft({
      id: m.id,
      kind: m.kind,
      dim: m.dim,
      x: m.x,
      z: m.z,
      y: m.y ?? null,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      visibility: m.visibility,
      boundary: m.boundary,
      geometry: m.geometry,
    });
    setPanel("edit");
  };

  const changeArea = (vertices: Vertex[], remember = true) => {
    if (remember) {
      const previous = areaPointsRef.current;
      setAreaHistory((history) => [...history, previous]);
    }
    areaPointsRef.current = vertices;
    setAreaPoints(vertices);
    setAreaError("");
    requestPaint();
  };

  const startArea = () => {
    setTool("none");
    setAreaHistory([]);
    changeArea(draftRef.current?.boundary ?? [], false);
    areaEditRef.current = true;
    setAreaEdit(true);
    setMovingVertex(null);
    requestPaint();
  };

  const closeArea = () => {
    areaEditRef.current = false;
    setAreaEdit(false);
    setMovingVertex(null);
    requestPaint();
  };

  const finishArea = () => {
    if (!validPolygon(areaPointsRef.current)) {
      setAreaError(
        "Нужно минимум три разные вершины. Стороны контура не должны пересекаться.",
      );
      return;
    }
    if (draftRef.current)
      setDraft({ ...draftRef.current, boundary: areaPointsRef.current });
    closeArea();
  };

  async function call(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return { ok: res.ok, data };
    } catch {
      return {
        ok: false,
        data: { message: "Нет связи с сайтом. Попробуйте ещё раз." },
      };
    } finally {
      setBusy(false);
    }
  }

  const saveDraft = async () => {
    const d = draftRef.current;
    if (!d) return;
    const { id, ...fields } = d;
    const r = id
      ? await call(`/api/map/markers/${id}`, "PATCH", fields)
      : await call("/api/map/markers", "POST", fields);
    if (!r.ok) {
      setMarkerError(String(r.data.message ?? "Не удалось сохранить метку."));
      return;
    }
    const saved = r.data.marker as MapMarker;
    setMarkers([...markersRef.current.filter((m) => m.id !== saved.id), saved]);
    setDraft(null);
    select(saved.id);
    setPanel("view");
    if (saved.status === "pending")
      flash("Метка отправлена на проверку модератору.");
  };

  const deleteSelected = async () => {
    const id = selectedRef.current ?? draftRef.current?.id;
    setOverlay("none");
    if (!id) return;
    const r = await call(`/api/map/markers/${id}`, "DELETE");
    if (!r.ok) {
      flash(String(r.data.message ?? "Не удалось удалить метку."));
      return;
    }
    setMarkers(markersRef.current.filter((m) => m.id !== id));
    closePanel();
  };

  const sendReport = async (reason: string) => {
    const id = selectedRef.current;
    if (!id) return;
    const r = await call(`/api/map/markers/${id}/report`, "POST", { reason });
    if (!r.ok) {
      setMarkerError(String(r.data.message ?? "Не удалось отправить жалобу."));
      return;
    }
    setOverlay("none");
    setMarkerError(null);
    flash("Жалоба отправлена модераторам.");
  };

  /** "Hide" in the list and on the card hides a marker in this browser only, as the mod does. */
  const setHidden = (next: Set<string>) => {
    hiddenRef.current = next;
    setHiddenState(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      /* kept until the page closes */
    }
    requestPaint();
  };
  const toggleHidden = (id: string) => {
    const next = new Set(hiddenRef.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  };
  const toggleAllHidden = () => {
    const inDim = markersRef.current.filter((m) => m.dim === dimRef.current);
    const anyVisible = inDim.some((m) => !hiddenRef.current.has(m.id));
    const next = new Set(hiddenRef.current);
    for (const m of inDim) {
      if (anyVisible) next.add(m.id);
      else next.delete(m.id);
    }
    setHidden(next);
  };

  // /map?m=<id> opens the map on a marker once the map is there (a link from moderation or a chat)
  const linked = useRef(false);
  const openLinked = useRef<(m: MapMarker) => void>(() => {});
  useEffect(() => {
    openLinked.current = (m) => openView(m, true);
  });
  useEffect(() => {
    if (linked.current || (status !== "ready" && status !== "empty")) return;
    linked.current = true;
    const id = new URLSearchParams(window.location.search).get("m");
    if (!id) return;
    void fetch(`/api/map/markers/${encodeURIComponent(id)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { marker: MapMarker } | null) => {
        if (!body) return;
        const m = body.marker;
        if (!markersRef.current.some((x) => x.id === m.id))
          markersRef.current = [...markersRef.current, m];
        setMarkersState(markersRef.current);
        openLinked.current(m);
      })
      .catch(() => {});
  }, [status]);

  // ------------------------------------------------------------------ pointer input

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{
    x: number;
    y: number;
    button: number;
    cam: Camera;
    dragging: boolean;
  } | null>(null);
  const pinch = useRef(0);

  const local = (e: React.PointerEvent): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const routePointAt = (mx: number, my: number): TrailPoint =>
    screenToWorld(cam.current, size.current, mx, my).map(
      Math.round,
    ) as TrailPoint;

  const eraseAt = (mx: number, my: number) => {
    const list = strokesOf(dimRef.current);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (
        distanceTo(cam.current, size.current, s, mx, my) <=
        (6 + s.width / 2) * gRef.current
      ) {
        list.splice(i, 1);
        (erased.current ??= []).push(s);
      }
    }
  };

  const visibleMarkers = () =>
    markersRef.current.filter(
      (m) =>
        m.dim === dimRef.current &&
        (m.id === selectedRef.current ||
          (prefsRef.current.markers && !hiddenRef.current.has(m.id))),
    );

  /** MapScreen.onMapClick: a marker opens its card; a right click on bare map puts a marker. */
  function mapClick(mx: number, my: number, button: number) {
    if (areaEdit) {
      if (button !== 0) return;
      const [worldX, worldZ] = screenToWorld(cam.current, size.current, mx, my);
      const point: Vertex = [Math.round(worldX), Math.round(worldZ)];
      const vertices = areaPointsRef.current;
      if (movingVertex !== null) {
        changeArea(vertices.map((v, i) => (i === movingVertex ? point : v)));
        setMovingVertex(null);
        return;
      }
      if (vertices.length >= 3) {
        const first = vertices[0];
        const [firstX, firstY] = worldToScreen(
          cam.current,
          size.current,
          ...first,
        );
        if (
          (point[0] === first[0] && point[1] === first[1]) ||
          Math.hypot(mx - firstX, my - firstY) <= AREA_CLOSE_RADIUS
        ) {
          finishArea();
          return;
        }
      }
      if (vertices.some(([x, z]) => x === point[0] && z === point[1])) {
        setAreaError("Эта вершина уже есть. Выберите другое место.");
      } else if (vertices.length >= MAX_VERTICES) {
        setAreaError(`Максимум вершин: ${MAX_VERTICES}.`);
      } else {
        changeArea([...vertices, point]);
      }
      return;
    }
    touchedArea.current = null;
    requestPaint();
    if (toolRef.current === "marker") {
      if (button === 0 || button === 2) {
        const [wx, wz] = screenToWorld(cam.current, size.current, mx, my);
        startMarker(wx, wz);
      }
      return;
    }
    const hit = markerAt(
      cam.current,
      size.current,
      visibleMarkers(),
      mx,
      my,
      gRef.current,
    );
    if (hit) {
      openView(hit, false);
      return;
    }
    if (button === 2) {
      if (panel === "edit") return;
      const [wx, wz] = screenToWorld(cam.current, size.current, mx, my);
      startMarker(wx, wz);
    } else if (panel !== "none") closePanel();
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = 0;
    const [mx, my] = local(e);
    press.current = {
      x: mx,
      y: my,
      button: e.button,
      cam: cam.current,
      dragging: false,
    };
    if (
      toolRef.current === "route" &&
      e.button === 0 &&
      pointers.current.size === 1
    ) {
      const index = routePointsRef.current.findIndex(([x, z]) => {
        const [sx, sy] = worldToScreen(cam.current, size.current, x, z);
        return Math.hypot(mx - sx, my - sy) <= 8;
      });
      draggedRoutePoint.current = index === -1 ? null : index;
    }
    clearTimeout(longPress.current);
    // a long press on a touch screen does what a right click does
    if (e.pointerType === "touch" && toolRef.current === "none" && !areaEdit) {
      longPress.current = setTimeout(() => {
        const p = press.current;
        if (!p || p.dragging || pointers.current.size !== 1) return;
        p.dragging = true; // the release is no longer a tap
        mapClick(p.x, p.y, 2);
      }, 550);
    }
    if (
      toolRef.current === "draw" &&
      e.button === 0 &&
      pointers.current.size === 1
    ) {
      const [wx, wz] = screenToWorld(cam.current, size.current, mx, my);
      const { tool: dt, color, width: wd } = drawRef.current;
      if (dt === "eraser") {
        erased.current = null;
        eraseAt(mx, my);
      } else {
        current.current = {
          type: dt,
          color,
          width: wd,
          pts: dt === "pen" ? [wx, wz] : [wx, wz, wx, wz],
        };
      }
      requestPaint();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [mx, my] = local(e);
    mouse.current = [mx, my];
    if (feed.current?.staff) {
      const [wx, wz] = screenToWorld(cam.current, size.current, mx, my);
      setCursor([Math.floor(wx), Math.floor(wz)]);
    }
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (areaEdit) return;
      const hit =
        toolRef.current === "none"
          ? markerAt(
              cam.current,
              size.current,
              visibleMarkers(),
              mx,
              my,
              gRef.current,
            )
          : null;
      if ((hit?.id ?? null) !== hoveredRef.current) {
        hoveredRef.current = hit?.id ?? null;
        e.currentTarget.setAttribute("title", hit?.name ?? "");
        (e.currentTarget as HTMLElement).style.cursor = hit
          ? "pointer"
          : toolRef.current === "none"
            ? "grab"
            : "crosshair";
        requestPaint();
      } else if (toolRef.current !== "none") requestPaint();
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const all = [...pointers.current.values()];
    const p = press.current;
    if (all.length === 2) {
      current.current = null;
      draggedRoutePoint.current = null;
      const d = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      if (pinch.current) {
        const r = e.currentTarget.getBoundingClientRect();
        zoomBy(
          d / pinch.current,
          (all[0].x + all[1].x) / 2 - r.left,
          (all[0].y + all[1].y) / 2 - r.top,
        );
      }
      pinch.current = d;
      if (p) p.dragging = true;
      return;
    }
    if (!p) return;
    const index = draggedRoutePoint.current;
    if (toolRef.current === "route" && index !== null) {
      p.dragging ||= Math.hypot(mx - p.x, my - p.y) > 3 * gRef.current;
      if (p.dragging) {
        const point = routePointAt(mx, my);
        changeRoute(
          routePointsRef.current.map((old, i) => (i === index ? point : old)),
        );
      }
      return;
    }
    if (toolRef.current === "draw" && p.button === 0) {
      if (drawRef.current.tool === "eraser") {
        eraseAt(mx, my);
      } else if (current.current) {
        const [wx, wz] = screenToWorld(cam.current, size.current, mx, my);
        const s = current.current;
        if (s.type === "pen") {
          const [lx, ly] = worldToScreen(
            cam.current,
            size.current,
            s.pts[s.pts.length - 2],
            s.pts[s.pts.length - 1],
          );
          if (Math.hypot(mx - lx, my - ly) >= 2 * gRef.current)
            s.pts.push(wx, wz);
        } else {
          s.pts[2] = wx;
          s.pts[3] = wz;
        }
      }
      requestPaint();
      return;
    }
    if (!p.dragging && Math.hypot(mx - p.x, my - p.y) > 3 * gRef.current) {
      p.dragging = true;
      clearTimeout(longPress.current);
    }
    if (p.dragging) {
      cam.current = panBy(p.cam, mx - p.x, my - p.y);
      moved();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = 0;
    const p = press.current;
    if (!p || pointers.current.size > 0) return;
    press.current = null;
    const [mx, my] = local(e);
    if (toolRef.current === "route") {
      const grabbed = draggedRoutePoint.current !== null;
      draggedRoutePoint.current = null;
      if (e.type === "pointercancel" || p.dragging || grabbed || p.button !== 0)
        return;
      const points = routePointsRef.current;
      const point = routePointAt(mx, my);
      const last = points.at(-1);
      if (last && last[0] === point[0] && last[1] === point[1]) return;
      if (points.length >= MAX_ROUTE_POINTS) {
        flash(`Максимум точек маршрута: ${MAX_ROUTE_POINTS}.`);
        return;
      }
      changeRoute([...points, point]);
      return;
    }
    if (toolRef.current === "draw" && p.button === 0) {
      const list = strokesOf(dimRef.current);
      if (drawRef.current.tool === "eraser") {
        const removed = erased.current;
        if (removed?.length) {
          undo.current.push(() => list.push(...removed));
          commitStrokes();
        }
        erased.current = null;
      } else if (current.current) {
        const s = current.current;
        current.current = null;
        const [ax, ay] = worldToScreen(
          cam.current,
          size.current,
          s.pts[0],
          s.pts[1],
        );
        const [bx, by] =
          s.pts.length >= 4
            ? worldToScreen(cam.current, size.current, s.pts[2], s.pts[3])
            : [ax, ay];
        if (
          s.type === "pen" ||
          Math.hypot(bx - ax, by - ay) > 2 * gRef.current
        ) {
          list.push(s);
          undo.current.push(() => {
            const i = list.indexOf(s);
            if (i >= 0) list.splice(i, 1);
          });
          commitStrokes();
          if (!prefsRef.current.drawings)
            savePrefs({ ...prefsRef.current, drawings: true });
        }
      }
      requestPaint();
      return;
    }
    clearTimeout(longPress.current);
    if (
      !p.dragging &&
      (toolRef.current === "none" || toolRef.current === "marker")
    ) {
      mapClick(mx, my, p.button);
      return;
    }
    if (!p.dragging && toolRef.current === "ruler") {
      if (p.button === 0) {
        ruler.current.push(screenToWorld(cam.current, size.current, mx, my));
      } else if (p.button === 2) {
        ruler.current.pop();
      }
      updateRuler();
      requestPaint();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (e.key === "Escape") {
      if (overlay !== "none") setOverlay("none");
      else if (areaEdit) closeArea();
      else if (panel !== "none") closePanel();
      else if (tool !== "none") setTool("none");
      return;
    }
    if (overlay !== "none") return;
    if (e.key === "Enter" && tool === "route" && e.target === root.current) {
      e.preventDefault();
      finishRoute();
      return;
    }
    if (e.key === "Enter" && tool === "marker" && e.target === root.current) {
      e.preventDefault();
      startMarker(cam.current.x, cam.current.z);
      return;
    }
    const step = 80;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (keys[e.key]) {
      e.preventDefault();
      cam.current = panBy(cam.current, ...keys[e.key]);
      moved();
    } else if (e.key === "+" || e.key === "=") zoomBy(1.5);
    else if (e.key === "-") zoomBy(1 / 1.5);
    else if (e.code === "KeyJ") setListOpen(!listOpen);
    else if (e.code === "KeyR" && !areaEdit)
      setTool(tool === "ruler" ? "none" : "ruler");
    else if (e.code === "KeyG" && !areaEdit)
      setTool(tool === "draw" ? "none" : "draw");
    else if (e.code === "KeyH")
      savePrefs({ ...prefs, drawings: !prefs.drawings });
    else if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey)) doUndo();
    else if (e.key === "Backspace" && tool === "ruler") {
      ruler.current = [];
      updateRuler();
      requestPaint();
    }
  };

  // ------------------------------------------------------------------ layout

  const gw = width / g; // the window width in GUI pixels
  const listW = Math.max(130, Math.min(180, gw / 4));
  const panelW = Math.max(150, Math.min(190, gw / 3));
  const freeLeft = 6 + TB + 8 + (listOpen ? listW + 4 : 0);
  const freeRight = panel !== "none" ? gw - panelW - 10 : gw - 6;
  const midX = ((freeLeft + freeRight) / 2) * g;
  const u = (n: number) => px(n * g);

  type Action =
    | "list"
    | "place"
    | "route"
    | "save-path"
    | "markers"
    | "ruler"
    | "draw"
    | "drawings"
    | "center"
    | "in"
    | "out"
    | "dims"
    | "settings";
  const toolbar: {
    action: Action;
    icon: string;
    label: string;
    pressed?: boolean;
    src?: string;
  }[] = [
    {
      action: "list",
      icon: "list",
      label: "Список меток [J]",
      pressed: listOpen,
    },
    {
      action: "place",
      icon: "plus",
      label: "Поставить метку",
      pressed: tool === "marker",
    },
    {
      action: "route",
      icon: "line",
      label: "Нарисовать маршрут",
      pressed: tool === "route",
    },
    { action: "save-path", icon: "check", label: "Сохранить путь" },
    {
      action: "ruler",
      icon: "ruler",
      label: "Линейка [R]",
      pressed: tool === "ruler",
    },
    {
      action: "draw",
      icon: "quill",
      label: "Редактор — рисовать на карте [G]",
      pressed: tool === "draw",
    },
    {
      action: "drawings",
      icon: prefs.drawings ? "eye" : "eye_off",
      label: prefs.drawings ? "Скрыть рисунки [H]" : "Показать рисунки [H]",
      pressed: !prefs.drawings,
    },
    {
      action: "markers",
      icon: "pin",
      src: "/map/ui/markers/pin.png",
      label: prefs.markers
        ? "Скрыть метки на карте"
        : "Показать метки на карте",
      pressed: !prefs.markers,
    },
    { action: "center", icon: "map", label: "К середине карты" },
    { action: "in", icon: "zoom_in", label: "Приблизить [+ / колесо]" },
    { action: "out", icon: "zoom_out", label: "Отдалить [- / колесо]" },
    {
      action: "dims",
      icon: "globe",
      label: "Измерения",
      pressed: overlay === "dims",
    },
    {
      action: "settings",
      icon: "gear",
      label: "Настройки",
      pressed: overlay === "settings",
    },
  ];
  function run(action: Action) {
    if (action === "list") setListOpen(!listOpen);
    else if (action === "place") {
      const placing = tool !== "marker";
      setTool(placing ? "marker" : "none");
      if (placing) {
        closePanel();
        if (gw < 420) setListOpen(false);
        root.current?.focus();
      }
    } else if (action === "route") {
      const placing = tool !== "route";
      setTool(placing ? "route" : "none");
      if (placing) {
        closePanel();
        setListOpen(false);
        root.current?.focus();
      }
    } else if (action === "save-path") {
      setTool("none");
      startMarker(cam.current.x, cam.current.z, { kind: "path" });
    } else if (action === "markers")
      savePrefs({ ...prefs, markers: !prefs.markers });
    else if (action === "ruler") setTool(tool === "ruler" ? "none" : "ruler");
    else if (action === "draw") setTool(tool === "draw" ? "none" : "draw");
    else if (action === "drawings")
      savePrefs({ ...prefs, drawings: !prefs.drawings });
    else if (action === "center") center();
    else if (action === "in") zoomBy(1.5);
    else if (action === "out") zoomBy(1 / 1.5);
    else if (action === "dims")
      setOverlay(overlay === "dims" ? "none" : "dims");
    else setOverlay("settings");
  }
  const markerActions: Action[] = ["place", "route", "save-path"];
  const visibleToolbar = toolbar.filter(
    (b) => !markerActions.includes(b.action) || me.canCreate,
  );
  const globeAt = visibleToolbar.findIndex((b) => b.icon === "globe");

  const selectedMarker = markers.find((x) => x.id === selectedId) ?? null;
  const drawBarW = 20 * 11 + 15;
  const settingsW = Math.min(gw - 16, 430);
  const twoCols = settingsW >= 380;
  const colW = twoCols ? (settingsW - 30) / 2 : settingsW - 20;
  const tileW = (colW - 4) / 2;

  return (
    <div
      ref={root}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ ...themeVars(theme), "--g": px(g) } as React.CSSProperties}
      data-ornate={theme.ornate}
      className="atlas"
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label="Карта мира. Перетаскивайте, чтобы двигать, колесо мыши или кнопки плюс и минус, чтобы менять масштаб."
        className="absolute inset-0 size-full"
        style={{ cursor: tool === "none" && !areaEdit ? "grab" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          mouse.current = null;
          setCursor(null);
          if (toolRef.current !== "none") requestPaint();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDoubleClick={() => {
          if (tool === "route") finishRoute();
        }}
      />

      {/* MapScreen.drawToolbar */}
      <div
        className="atlas-toolbar"
        role="toolbar"
        aria-label="Инструменты карты"
        aria-orientation="vertical"
      >
        {visibleToolbar.map((b, i) => (
          <IconButton
            key={b.action}
            theme={theme}
            offset={i}
            icon={b.icon}
            label={b.label}
            pressed={b.pressed}
            disabled={
              (markerActions.includes(b.action) && panel === "edit") ||
              (tool === "route" &&
                (b.action === "dims" || b.action === "list")) ||
              (areaEdit && (b.action === "ruler" || b.action === "draw"))
            }
            src={b.src}
            onClick={() => run(b.action)}
          />
        ))}
        <a
          href={backHref}
          className="atlas-btn"
          aria-label="Закрыть карту"
          title="Закрыть карту"
          style={{ "--bx": u(-300), "--by": u(-500) } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toolIcon(theme, "close")} alt="" draggable={false} />
        </a>
      </div>

      {/* MapScreen.drawTitle, or the ruler bar, or the drawing bar */}
      {tool === "none" && (
        <Panel
          className="flex items-center"
          style={{
            left: px(midX),
            top: u(6),
            height: u(18),
            maxWidth: u(freeRight - freeLeft),
            padding: `0 ${u(3)}`,
            transform: "translateX(-50%)",
            overflow: "hidden",
          }}
        >
          <span className="atlas-title">
            Мир MineOrt &nbsp;·&nbsp; {DIM_NAMES[dim]}
          </span>
        </Panel>
      )}

      {tool === "marker" && (
        <Panel
          role="status"
          className="pointer-events-none text-center"
          style={{
            left: px(midX),
            top: u(6),
            transform: "translateX(-50%)",
            width: "max-content",
            maxWidth: u(freeRight - freeLeft),
            padding: `${u(4)} ${u(6)}`,
          }}
        >
          Выберите место на карте. Enter — поставить в центре.
        </Panel>
      )}

      {tool === "route" && (
        <Panel
          role="region"
          aria-label="Построение маршрута"
          className="atlas-area-editor"
        >
          <p>
            Ставьте точки щелчком и перетаскивайте их. Двойной щелчок завершает
            маршрут.
          </p>
          <p role="status">Длина {fmtDistance(routeLength(routePoints))} бл.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              disabled={routePoints.length < 2}
              onClick={finishRoute}
            >
              Завершить маршрут
            </button>
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              onClick={() => setTool("none")}
            >
              Отмена
            </button>
          </div>
        </Panel>
      )}

      {tool === "ruler" && (
        <Panel
          role="status"
          style={{
            left: px(midX),
            top: u(6),
            transform: "translateX(-50%)",
            width: "max-content",
            maxWidth: u(freeRight - freeLeft),
            padding: `${u(5)} ${u(14)} ${u(5)} ${u(30)}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={toolIcon(theme, "ruler")}
            alt=""
            className="absolute"
            style={{
              left: u(8),
              top: "50%",
              width: u(16),
              height: u(16),
              transform: "translateY(-50%)",
            }}
          />
          {rulerText.map((l) => (
            <div key={l}>{l}</div>
          ))}
          <div style={{ color: "var(--ink-soft)" }}>
            ЛКМ — точка, ПКМ — убрать последнюю, Backspace — сброс
          </div>
        </Panel>
      )}

      {tool === "draw" && (
        <Panel
          style={{
            left: px(midX - (drawBarW * g) / 2),
            top: u(6),
            width: u(drawBarW),
            height: u(64),
          }}
          role="group"
          aria-label="Рисование"
        >
          {DRAW_TOOLS.map((d, i) => (
            <div
              key={d.tool}
              className="absolute"
              style={{ left: u(6 + i * 20), top: u(4) }}
            >
              <IconButton
                theme={theme}
                icon={d.icon}
                label={d.label}
                size={18}
                offset={i + 3}
                pressed={drawTool === d.tool}
                onClick={() => {
                  setDrawTool(d.tool);
                  drawRef.current.tool = d.tool;
                }}
              />
            </div>
          ))}
          {WIDTHS.map((wd, i) => (
            <button
              key={wd}
              type="button"
              aria-label={`Толщина ${wd}`}
              aria-pressed={widthIdx === i}
              className="absolute grid place-items-center"
              style={{
                left: u(6 + 5 * 20 + 4 + i * 14),
                top: u(4),
                width: u(13),
                height: u(18),
                cursor: "pointer",
                background:
                  widthIdx === i
                    ? "color-mix(in srgb, var(--gold) 25%, transparent)"
                    : undefined,
                border:
                  widthIdx === i ? `${u(1)} solid var(--gold)` : undefined,
              }}
              onClick={() => {
                setWidthIdx(i);
                drawRef.current.width = wd;
              }}
            >
              <span
                style={{
                  width: u(wd + 1),
                  height: u(wd + 1),
                  background:
                    PALETTE[colorIdx] === "#ffffff" ||
                    PALETTE[colorIdx] === "#f2e6c8"
                      ? "var(--ink)"
                      : PALETTE[colorIdx],
                }}
              />
            </button>
          ))}
          <div
            className="absolute"
            style={{ left: u(drawBarW - 7 - 38 - 1), top: u(4) }}
          >
            <IconButton
              theme={theme}
              icon="undo"
              label="Отменить [Ctrl+Z]"
              size={18}
              offset={9}
              onClick={doUndo}
            />
          </div>
          <div
            className="absolute"
            style={{ left: u(drawBarW - 7 - 18 - 1), top: u(4) }}
          >
            <IconButton
              theme={theme}
              icon="trash"
              label="Стереть все рисунки этого измерения"
              size={18}
              offset={10}
              onClick={() => setOverlay("confirm")}
            />
          </div>
          {PALETTE.map((col, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Цвет ${i + 1}`}
              aria-pressed={colorIdx === i}
              className="absolute"
              style={{
                left: u(7 + (i % 20) * 11 - 1),
                top: u(27 + Math.floor(i / 20) * 11 - 1),
                width: u(11),
                height: u(11),
                background: col,
                border: `${u(1)} solid var(--ink)`,
                outline:
                  colorIdx === i
                    ? `${u(1)} solid var(--gold-light)`
                    : undefined,
                boxShadow:
                  colorIdx === i
                    ? `0 0 0 ${u(1)} var(--gold) inset`
                    : undefined,
                cursor: "pointer",
              }}
              onClick={() => {
                setColorIdx(i);
                drawRef.current.color = col;
              }}
            />
          ))}
        </Panel>
      )}

      {/* MapScreen.drawStatus: cursor position (staff only on this site) and the scale bar */}
      <Panel
        className="flex items-center"
        style={{
          left: u(6 + TB + 10 + (listOpen ? listW + 4 : 0)),
          bottom: u(6),
          height: u(16),
          padding: `0 ${u(6)}`,
          gap: u(5),
        }}
      >
        {staff && cursor && (
          <span style={{ marginRight: u(7), whiteSpace: "pre" }}>
            {`X ${cursor[0]}   Z ${cursor[1]}`}
          </span>
        )}
        <span
          className="relative"
          style={{ width: px(scaleInfo.px * g), height: u(7), flex: "none" }}
          aria-hidden="true"
        >
          <span
            className="absolute inset-x-0"
            style={{ bottom: u(1), height: u(2), background: "var(--ink)" }}
          />
          <span
            className="absolute left-0"
            style={{
              bottom: 0,
              width: u(1),
              height: u(7),
              background: "var(--ink)",
            }}
          />
          <span
            className="absolute right-0"
            style={{
              bottom: 0,
              width: u(1),
              height: u(7),
              background: "var(--ink)",
            }}
          />
          <span
            className="absolute left-1/2"
            style={{
              bottom: u(1),
              width: u(1),
              height: u(4),
              background: "var(--ink)",
            }}
          />
        </span>
        <span style={{ color: "var(--ink-soft)" }}>{scaleInfo.blocks} бл.</span>
      </Panel>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/map/ui/compass.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute"
        style={{
          right: u(panel !== "none" ? panelW + 16 : 10),
          bottom: u(8),
          width: u(48),
          height: u(48),
        }}
      />

      {/* site states the mod has no screen for: who may see players, an empty or failed map */}
      {(feedState === "guest" ||
        feedState === "nonmember" ||
        feedState === "offline" ||
        status !== "ready") && (
        <div
          className="absolute flex flex-col items-end"
          style={{
            right: u(panel !== "none" ? panelW + 12 : 6),
            bottom: u(60),
            gap: u(4),
            maxWidth: u(gw - 40),
          }}
        >
          {status === "loading" && (
            <Panel
              role="status"
              style={{
                position: "relative",
                padding: `${u(3)} ${u(6)}`,
              }}
            >
              Загрузка карты…
            </Panel>
          )}
          {feedState === "guest" && (
            <a
              href="/api/auth/telegram/start?return_to=/map"
              className="atlas-text-btn"
            >
              Войдите, чтобы видеть игроков
            </a>
          )}
          {feedState === "nonmember" && (
            <Panel
              role="status"
              style={{ position: "relative", padding: `${u(3)} ${u(6)}` }}
            >
              Игроков видят участники сообщества
            </Panel>
          )}
          {feedState === "offline" && (
            <Panel
              role="status"
              style={{ position: "relative", padding: `${u(3)} ${u(6)}` }}
            >
              Игроки сейчас не видны
            </Panel>
          )}
        </div>
      )}
      {status === "empty" && (
        <Panel
          role="status"
          className="pointer-events-none text-center"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            padding: u(10),
            maxWidth: u(220),
          }}
        >
          Карта откроется, когда игроки начнут исследовать мир.
        </Panel>
      )}
      {status === "error" && (
        <Panel
          role="alert"
          className="pointer-events-none flex flex-col items-center text-center"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            padding: u(10),
            gap: u(8),
          }}
        >
          Не удалось загрузить карту.
          <button
            type="button"
            className="atlas-text-btn pointer-events-auto"
            style={{ width: u(100) }}
            onClick={() => void refresh(true)}
          >
            Повторить
          </button>
        </Panel>
      )}

      {/* MapScreen.drawDims */}
      {overlay === "dims" && (
        <>
          <div className="atlas-dim" onClick={() => setOverlay("none")} />
          <Panel
            role="group"
            aria-label="Измерения"
            style={{
              left: u(6 + TB + 8),
              top: u(Math.max(6, 6 + globeAt * (TB + 3))),
              width: u(150),
              padding: `${u(5)} ${u(7)} ${u(7)}`,
            }}
          >
            <div className="atlas-title" style={{ marginBottom: u(5) }}>
              Измерения
            </div>
            <div className="flex flex-col" style={{ gap: u(3) }}>
              {(["overworld", "nether"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className="atlas-text-btn"
                  aria-pressed={dim === d}
                  onClick={() => {
                    if (d !== dim) {
                      setStatus("loading");
                      setDim(d);
                      ruler.current = [];
                      setRulerText([]);
                    }
                    setOverlay("none");
                  }}
                >
                  {dim === d ? `» ${DIM_NAMES[d]} «` : DIM_NAMES[d]}
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}

      {/* SettingsScreen */}
      {overlay === "settings" && (
        <>
          <div
            className="atlas-dim"
            style={{ background: "var(--dim)" }}
            onClick={() => setOverlay("none")}
          />
          <Panel
            role="dialog"
            aria-label="Настройки"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: u(settingsW),
              maxHeight: `calc(100% - ${u(16)})`,
              padding: `${u(6)} ${u(10)} ${u(28)}`,
              overflowY: "auto",
            }}
          >
            <div className="atlas-title" style={{ marginBottom: u(7) }}>
              Настройки
            </div>
            <div className="absolute" style={{ right: u(4), top: u(4) }}>
              <IconButton
                theme={theme}
                icon="close"
                label="Закрыть настройки"
                size={13}
                offset={2}
                onClick={() => setOverlay("none")}
              />
            </div>
            <div
              className={twoCols ? "flex" : "flex flex-col"}
              style={{ gap: u(10) }}
            >
              <div style={{ width: u(colW) }}>
                <div className="atlas-section">Оформление</div>
                <div className="grid grid-cols-2" style={{ gap: u(4) }}>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="atlas-theme"
                      aria-pressed={theme.id === t.id}
                      aria-label={t.name}
                      onClick={() => chooseTheme(t)}
                      style={{
                        width: u(tileW),
                        backgroundImage: `url(${t.panel})`,
                        color: t.ink,
                      }}
                    >
                      <span
                        className="absolute"
                        style={{ left: u(4), top: u(4) }}
                      >
                        {t.name}
                      </span>
                      {theme.id === t.id && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={toolIcon(t, "check")}
                          alt=""
                          className="absolute"
                          style={{
                            right: u(2),
                            top: u(2),
                            width: u(12),
                            height: u(12),
                          }}
                        />
                      )}
                      <span
                        className="absolute"
                        style={{
                          left: u(3),
                          bottom: u(3),
                          width: u(26),
                          height: u(10),
                          background: `url(${t.panelDark}) 0 0 / ${u(256)}`,
                          border: `${u(1)} solid ${t.ink}`,
                        }}
                      />
                      <span
                        className="absolute"
                        style={{
                          left: u(33),
                          right: u(5),
                          bottom: u(7),
                          height: u(2),
                          background: t.accent,
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ width: u(colW) }}>
                <div className="atlas-section">Карта</div>
                <div className="flex flex-col" style={{ gap: u(3) }}>
                  <button
                    type="button"
                    className="atlas-text-btn"
                    aria-pressed={prefs.players}
                    onClick={() =>
                      savePrefs({ ...prefs, players: !prefs.players })
                    }
                  >
                    Игроки на карте: {prefs.players ? "вкл" : "выкл"}
                  </button>
                  <button
                    type="button"
                    className="atlas-text-btn"
                    aria-pressed={prefs.drawings}
                    onClick={() =>
                      savePrefs({ ...prefs, drawings: !prefs.drawings })
                    }
                  >
                    Рисунки на карте: {prefs.drawings ? "вкл" : "выкл"}
                  </button>
                </div>
                <p className="atlas-hint" style={{ marginTop: u(6) }}>
                  Рисунки хранятся только в этом браузере.
                </p>
                <p className="atlas-hint" style={{ marginTop: u(6) }}>
                  Вид карты и интерфейс — мод{" "}
                  <a
                    href="https://github.com/erkinpaw/atlasmap"
                    className="underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    AtlasMap
                  </a>{" "}
                  (erkinpaw, лицензия{" "}
                  <a
                    href="/map/ATLASMAP-LICENSE.txt"
                    className="underline"
                    target="_blank"
                  >
                    MIT
                  </a>
                  ).
                </p>
                {hasCollections && (
                  <Link href="/map/collections" className="underline">
                    Подборки атласа
                  </Link>
                )}
              </div>
            </div>
            <div
              className="absolute"
              style={{
                left: "50%",
                bottom: u(6),
                transform: "translateX(-50%)",
              }}
            >
              <button
                type="button"
                className="atlas-text-btn"
                style={{ width: u(100) }}
                onClick={() => setOverlay("none")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toolIcon(theme, "check")} alt="" />
                Готово
              </button>
            </div>
          </Panel>
        </>
      )}

      {markers
        .filter(
          (m) =>
            m.boundary &&
            m.dim === dim &&
            !hidden.has(m.id) &&
            prefs.markers &&
            !areaEdit,
        )
        .map((m) => (
          <button
            key={m.id}
            type="button"
            className="atlas-area-label absolute"
            ref={(node) => {
              if (node) {
                areaLabels.current.set(m.id, node);
                requestPaint();
              } else areaLabels.current.delete(m.id);
            }}
            onPointerEnter={() => {
              hoveredRef.current = m.id;
              requestPaint();
            }}
            onPointerLeave={() => {
              hoveredRef.current = null;
              requestPaint();
            }}
            onFocus={() => {
              focusedArea.current = m.id;
              requestPaint();
            }}
            onBlur={() => {
              focusedArea.current = null;
              requestPaint();
            }}
            onClick={() => {
              touchedArea.current = m.id;
              openView(m, false);
              requestPaint();
            }}
          >
            {m.name}
          </button>
        ))}
      {areaEdit && (
        <Panel
          className="atlas-area-editor"
          role="region"
          aria-label="Контур области"
        >
          <p>
            {movingVertex !== null
              ? "Нажмите на новое место вершины."
              : areaPoints.length < 3
                ? "Поставьте на карте минимум три вершины по порядку."
                : "Нажмите на первую вершину или кнопку «Замкнуть контур»."}
          </p>
          {areaError && <p role="alert">{areaError}</p>}
          {areaPoints.length > 0 && (
            <label>
              Переместить вершину{" "}
              <select
                className="atlas-input"
                value={movingVertex ?? ""}
                onChange={(e) =>
                  setMovingVertex(
                    e.target.value ? Number(e.target.value) - 1 : null,
                  )
                }
              >
                <option value="">Выбрать</option>
                {areaPoints.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              onClick={finishArea}
            >
              Замкнуть контур
            </button>
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              disabled={!areaHistory.length}
              onClick={() => {
                const previous = areaHistory.at(-1);
                if (previous) {
                  setAreaHistory((history) => history.slice(0, -1));
                  changeArea(previous, false);
                }
                setMovingVertex(null);
              }}
            >
              Отменить шаг
            </button>
            <button
              type="button"
              className="atlas-inset px-2 py-1"
              onClick={closeArea}
            >
              Назад
            </button>
          </div>
        </Panel>
      )}
      {/* MapScreen.drawList */}
      {listOpen && (
        <MarkerList
          theme={theme}
          g={g}
          width={listW}
          total={markers.filter((m) => m.dim === dim).length}
          markers={sortMarkers(
            markers.filter((m) => m.dim === dim),
            sort,
            query,
            viewMid,
          )}
          selected={selectedId}
          hidden={hidden}
          sort={sort}
          query={query}
          from={viewMid}
          emptyText={
            markersUnavailable
              ? "Не удалось загрузить метки."
              : me.canCreate
                ? "Меток пока нет. Нажмите «Поставить метку» или ПКМ по карте."
                : "Меток пока нет."
          }
          onSort={(dir) => {
            const i = SORTS.findIndex((x) => x.id === sort);
            setSort(SORTS[(i + dir + SORTS.length) % SORTS.length].id);
          }}
          onQuery={setQuery}
          onSelect={(m) => openView(m, true)}
          onToggleHidden={toggleHidden}
          onToggleAll={toggleAllHidden}
        />
      )}

      {/* MapScreen.drawViewPanel */}
      {panel === "view" && selectedMarker && (
        <MarkerCard
          theme={theme}
          g={g}
          width={panelW}
          marker={selectedMarker}
          staff={staff || me.canLabel}
          signedIn={me.signedIn}
          hiddenForMe={hidden.has(selectedMarker.id)}
          onClose={closePanel}
          onToggleHidden={() => toggleHidden(selectedMarker.id)}
          onGoto={() => openView(selectedMarker, true)}
          onEdit={() => editMarker(selectedMarker)}
          onDelete={() => setOverlay("delete-marker")}
          onReport={() => {
            setMarkerError(null);
            setOverlay("report");
          }}
        />
      )}

      {/* MapScreen.drawEditPanel */}
      {panel === "edit" && draft && !areaEdit && (
        <MarkerEditor
          theme={theme}
          g={g}
          width={panelW}
          draft={draft}
          canLabel={me.canLabel}
          inGuild={me.inGuild}
          busy={busy}
          error={markerError}
          onChange={setDraft}
          onBoundary={startArea}
          onClearBoundary={() => setDraft({ ...draft, boundary: null })}
          onPickIcon={() => setOverlay("icons")}
          onPickColor={() => {
            setColorFor(draft.icon);
            setOverlay("colors");
          }}
          onSave={() => void saveDraft()}
          onCancel={() => {
            const id = draft.id;
            setDraft(null);
            setMarkerError(null);
            if (id) {
              select(id);
              setPanel("view");
            } else closePanel();
          }}
          onDelete={() => setOverlay("delete-marker")}
        />
      )}

      {overlay === "icons" && draft && (
        <IconPicker
          theme={theme}
          g={g}
          current={draft.icon}
          color={draft.color}
          onClose={() => setOverlay("none")}
          onPick={(icon, withColor) => {
            setDraft({ ...draft, icon });
            if (withColor) {
              setColorFor(icon);
              setOverlay("colors");
            } else setOverlay("none");
          }}
        />
      )}
      {overlay === "colors" && draft && (
        <ColorPicker
          theme={theme}
          g={g}
          icon={colorFor ?? draft.icon}
          color={colorFor === draft.icon || !colorFor ? draft.color : null}
          onClose={() => setOverlay("none")}
          onPick={(color) => {
            setDraft({ ...draft, icon: colorFor ?? draft.icon, color });
            setOverlay("none");
          }}
        />
      )}
      {overlay === "report" && selectedId && (
        <ReportDialog
          theme={theme}
          g={g}
          name={markers.find((m) => m.id === selectedId)?.name ?? ""}
          error={markerError}
          busy={busy}
          onClose={() => setOverlay("none")}
          onSend={(reason) => void sendReport(reason)}
        />
      )}
      {overlay === "delete-marker" && (
        <>
          <div
            className="atlas-dim"
            style={{ background: "var(--dim)" }}
            onClick={() => setOverlay("none")}
          />
          <Panel
            role="alertdialog"
            aria-label="Удалить метку?"
            className="flex flex-col items-center text-center"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: u(Math.min(240, gw - 20)),
              padding: `${u(12)} ${u(12)} ${u(8)}`,
              gap: u(12),
            }}
          >
            Удалить метку «
            {markers.find((m) => m.id === (selectedId ?? draft?.id))?.name}»?
            <div className="flex" style={{ gap: u(8) }}>
              <button
                type="button"
                className="atlas-text-btn"
                style={{ width: u(80) }}
                disabled={busy}
                onClick={() => void deleteSelected()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toolIcon(theme, "check")} alt="" />
                Да
              </button>
              <button
                type="button"
                className="atlas-text-btn"
                style={{ width: u(80) }}
                onClick={() => setOverlay("none")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toolIcon(theme, "close")} alt="" />
                Нет
              </button>
            </div>
          </Panel>
        </>
      )}

      {toast && (
        <Panel
          role="status"
          style={{
            left: "50%",
            top: u(30),
            transform: "translateX(-50%)",
            padding: `${u(3)} ${u(8)}`,
          }}
        >
          {toast}
        </Panel>
      )}

      {/* MapScreen.drawConfirm */}
      {overlay === "confirm" && (
        <>
          <div
            className="atlas-dim"
            style={{ background: "var(--dim)" }}
            onClick={() => setOverlay("none")}
          />
          <Panel
            role="alertdialog"
            aria-label="Стереть все рисунки в этом измерении?"
            className="flex flex-col items-center text-center"
            style={{
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: u(Math.min(240, gw - 20)),
              padding: `${u(12)} ${u(12)} ${u(8)}`,
              gap: u(12),
            }}
          >
            Стереть все рисунки в этом измерении?
            <div className="flex" style={{ gap: u(8) }}>
              <button
                type="button"
                className="atlas-text-btn"
                style={{ width: u(80) }}
                onClick={() => {
                  clearDrawings();
                  setOverlay("none");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toolIcon(theme, "check")} alt="" />
                Да
              </button>
              <button
                type="button"
                className="atlas-text-btn"
                style={{ width: u(80) }}
                onClick={() => setOverlay("none")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={toolIcon(theme, "close")} alt="" />
                Нет
              </button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
