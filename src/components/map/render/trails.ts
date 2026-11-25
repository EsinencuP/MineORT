import {
  TRAIL_TELEPORT_BLOCKS,
  type TrailHistory,
  type TrailPoint,
} from "@/lib/map/trail-geometry";
import type { Camera, Viewport } from "../camera";
import type { Dot } from "../players";

const MAX_CONTINUOUS_MS = 30_000;

function extendCurve(path: Path2D, points: TrailPoint[]) {
  if (points.length < 2) return;
  path.moveTo(...points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[i + 1];
    path.quadraticCurveTo(x, z, (x + nx) / 2, (z + nz) / 2);
  }
  path.lineTo(...points[points.length - 1]);
}

type Sample = { at: number; point: TrailPoint; restart: boolean };

export class TrailLayer {
  nickname: string | null = null;
  private latest = 0;
  private restart = false;
  private anchor: TrailPoint | undefined;
  private live: Sample[] = [];
  private peerPath = new Path2D();
  private ownPath = new Path2D();
  private livePath = new Path2D();

  constructor(readonly dim: Dot["dim"]) {}

  replace(history: TrailHistory) {
    if (history.nickname !== this.nickname) {
      this.live = [];
      this.restart = false;
    }
    this.nickname = history.nickname;
    this.latest = history.ownLatestAt ?? 0;
    this.live = this.live.filter(({ at }) => at > this.latest);
    this.peerPath = new Path2D();
    this.ownPath = new Path2D();
    this.anchor = undefined;
    for (const trail of history.trails) {
      extendCurve(trail.mine ? this.ownPath : this.peerPath, trail.points);
      if (trail.mine) this.anchor = trail.points.at(-1);
    }
    this.buildLivePath();
  }

  observe(dot: Dot | undefined) {
    if (!dot || dot.dim !== this.dim) {
      this.restart = true;
      return;
    }
    const last = this.live.at(-1);
    if (dot.sampledAt <= (last?.at ?? this.latest)) return;
    this.live.push({
      at: dot.sampledAt,
      point: [dot.tx, dot.tz],
      restart: this.restart,
    });
    this.restart = false;
    const expiry = dot.sampledAt - 30 * 60_000;
    while (this.live[0].at < expiry) this.live.shift();
    this.buildLivePath();
  }

  private buildLivePath() {
    this.livePath = new Path2D();
    let segment = this.anchor ? [this.anchor] : [];
    let prevAt = this.latest;
    for (const { at, point, restart } of this.live) {
      const previous = segment.at(-1);
      if (
        previous &&
        (restart ||
          at - prevAt > MAX_CONTINUOUS_MS ||
          Math.hypot(point[0] - previous[0], point[1] - previous[1]) >
            TRAIL_TELEPORT_BLOCKS)
      ) {
        extendCurve(this.livePath, segment);
        segment = [];
      }
      segment.push(point);
      prevAt = at;
    }
    extendCurve(this.livePath, segment);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    viewport: Viewport,
    colors: { own: string; peer: string },
  ) {
    ctx.save();
    ctx.translate(
      viewport.width / 2 - camera.x * camera.scale,
      viewport.height / 2 - camera.z * camera.scale,
    );
    ctx.scale(camera.scale, camera.scale);
    ctx.lineWidth = 2 / camera.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = colors.peer;
    ctx.stroke(this.peerPath);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = colors.own;
    ctx.stroke(this.ownPath);
    ctx.stroke(this.livePath);
    ctx.restore();
  }
}
