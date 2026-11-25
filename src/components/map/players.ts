// Live players for the map: a private Realtime connection, opened with a token the site signs.
// Plain TypeScript, no React: the map view owns the lifecycle and just starts and stops it.

export type Dot = {
  name: string;
  dim: "overworld" | "nether";
  /** where the dot is drawn, eased towards the target */
  x: number;
  z: number;
  tx: number;
  tz: number;
  /** height, only for staff */
  y?: number;
  facing: number;
  seen: number;
  sampledAt: number;
};

export type FeedState =
  "connecting" | "live" | "guest" | "nonmember" | "offline";

type Wire = {
  n: string;
  d: "overworld" | "nether";
  x: number;
  z: number;
  y?: number;
  r: number;
};

const WATCH_MS = 30_000;
const GONE_MS = 30_000;
const TOKEN_MARGIN_S = 90;

export class PlayerFeed {
  readonly dots = new Map<string, Dot>();
  /** true when the token opens the staff channel: staff see exact coordinates */
  staff = false;
  private stopped = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cleanup: (() => void)[] = [];

  constructor(
    private readonly onState: (s: FeedState) => void,
    private readonly onChange: () => void,
  ) {}

  /** Asks for a token and joins the channels it opens. A guest gets no feed. */
  async start() {
    try {
      const res = await fetch("/api/map/realtime-token", {
        cache: "no-store",
      });
      if (res.status === 401) return this.onState("guest");
      if (res.status === 403) return this.onState("nonmember");
      if (!res.ok) return this.onState("offline");
      const first = (await res.json()) as {
        token: string;
        expiresAt: number;
        topics: string[];
        staff: boolean;
      };
      this.staff = first.staff;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return this.onState("offline");

      const { createClient } = await import("@supabase/supabase-js");
      if (this.stopped) return;
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await client.realtime.setAuth(first.token);

      let live = 0;
      for (const topic of first.topics) {
        const channel = client
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event: "pos" }, ({ payload }) =>
            this.receive(payload as { p: Wire[]; staff: boolean; t?: number }),
          )
          .subscribe((status) => {
            if (this.stopped) return;
            if (status === "SUBSCRIBED") {
              live += 1;
              this.onState("live");
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              live = Math.max(0, live - 1);
              if (live === 0) this.onState("offline");
            }
          });
        this.cleanup.push(() => void client.removeChannel(channel));
      }
      this.cleanup.push(() => void client.realtime.disconnect());

      this.every(WATCH_MS, () => void this.checkWatch());
      void this.checkWatch();
      this.refreshToken(client, first.expiresAt);
      this.every(5000, () => this.expire());
    } catch {
      if (!this.stopped) this.onState("offline");
    }
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const c of this.cleanup.splice(0)) c();
  }

  /** Moves every dot a step towards where it is heard to be; true while any is still moving. */
  ease(): boolean {
    let moving = false;
    for (const d of this.dots.values()) {
      const dx = d.tx - d.x;
      const dz = d.tz - d.z;
      if (Math.abs(dx) + Math.abs(dz) < 0.05) {
        d.x = d.tx;
        d.z = d.tz;
        continue;
      }
      // a long jump (teleport, a new dimension) is not a walk: do not drag the dot across the map
      if (Math.abs(dx) + Math.abs(dz) > 64) {
        d.x = d.tx;
        d.z = d.tz;
      } else {
        d.x += dx * 0.18;
        d.z += dz * 0.18;
        moving = true;
      }
    }
    return moving;
  }

  private async checkWatch() {
    const response = await fetch("/api/map/watch", { method: "POST" }).catch(
      () => null,
    );
    if (
      this.stopped ||
      !response ||
      (response.status !== 401 && response.status !== 403)
    )
      return;
    this.dots.clear();
    this.staff = false;
    this.onState(response.status === 401 ? "guest" : "nonmember");
    this.onChange();
    this.stop();
  }

  private receive(payload: { p: Wire[]; staff: boolean; t?: number }) {
    const now = Date.now();
    this.staff = payload.staff;
    const visible = new Set((payload.p ?? []).map((wire) => wire.n));
    for (const name of this.dots.keys())
      if (!visible.has(name)) this.dots.delete(name);
    for (const w of payload.p ?? []) {
      const old = this.dots.get(w.n);
      if (old && old.seen > now - 200 && old.tx === w.x && old.tz === w.z) {
        old.y = w.y;
        continue;
      }
      this.dots.set(w.n, {
        name: w.n,
        dim: w.d,
        x: old && old.dim === w.d ? old.x : w.x,
        z: old && old.dim === w.d ? old.z : w.z,
        tx: w.x,
        tz: w.z,
        y: w.y,
        facing: w.r,
        seen: now,
        sampledAt: payload.t ?? now,
      });
    }
    this.onChange();
  }

  private expire() {
    const cutoff = Date.now() - GONE_MS;
    let changed = false;
    for (const [name, d] of this.dots) {
      if (d.seen < cutoff) {
        this.dots.delete(name);
        changed = true;
      }
    }
    if (changed) this.onChange();
  }

  /** Gets a new token before the old one ends, so the channels stay open. */
  private refreshToken(
    client: { realtime: { setAuth: (t: string) => Promise<void> } },
    expiresAt: number,
  ) {
    const wait = Math.max(
      15_000,
      (expiresAt - TOKEN_MARGIN_S) * 1000 - Date.now(),
    );
    this.later(wait, async () => {
      try {
        const res = await fetch("/api/map/realtime-token", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as { token: string; expiresAt: number };
        await client.realtime.setAuth(next.token);
        this.refreshToken(client, next.expiresAt);
      } catch {
        if (!this.stopped) this.onState("offline");
      }
    });
  }

  private every(ms: number, fn: () => void) {
    const tick = () => {
      if (this.stopped) return;
      fn();
      this.later(ms, tick);
    };
    this.later(ms, tick);
  }

  private later(ms: number, fn: () => void | Promise<void>) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      void fn();
    }, ms);
    this.timers.add(t);
  }
}
