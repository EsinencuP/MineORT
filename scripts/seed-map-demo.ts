// Fills the map with a made-up island so the drawn style can be judged before the plugin exists.
// Usage: npm run seed:map [-- --clean]   (needs the service key in env; refuses production)
// The demo is a bridge server, so the whitelist queue also targets it and the bridge integration
// tests wait for it: run `npm run seed:map -- --clean` before running them.
import { createClient } from "@supabase/supabase-js";
import {
  COLUMNS,
  encodeChunk,
  type Column,
} from "../src/lib/map/chunk-codec.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
if (process.env.APP_ENV === "production")
  throw new Error("refusing to seed production");

const db = createClient(url, key, { auth: { persistSession: false } });
const NAME = "map-demo";

const { data: found } = await db
  .from("bridge_servers")
  .select("id")
  .eq("name", NAME)
  .maybeSingle();
const must = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`${what}: ${error.message}`);
};
// The demo markers belong to a made-up author, so they can be removed without touching real ones.
const DEMO_AUTHOR_TG = 9990000099;
async function demoAuthor(): Promise<string> {
  const { data, error } = await db.rpc("upsert_telegram_user", {
    p_telegram_id: DEMO_AUTHOR_TG,
    p_username: "map_demo",
    p_display_name: "Картограф",
  });
  if (error) throw new Error(`demo author: ${error.message}`);
  return (data as { user_id: string }[])[0].user_id;
}

if (process.argv.includes("--clean")) {
  if (found) {
    // the whitelist queue also queued actions for this server while it existed
    const { data: actions } = await db
      .from("server_actions")
      .select("id")
      .eq("server_id", found.id);
    const ids = (actions ?? []).map((a) => a.id as string);
    if (ids.length)
      must(
        "attempts",
        (await db.from("server_action_attempts").delete().in("action_id", ids))
          .error,
      );
    must(
      "actions",
      (await db.from("server_actions").delete().eq("server_id", found.id))
        .error,
    );
    must(
      "events",
      (await db.from("server_events").delete().eq("server_id", found.id)).error,
    );
    must(
      "drift",
      (await db.from("whitelist_drift").delete().eq("server_id", found.id))
        .error,
    );
    must(
      "chunks",
      (await db.from("map_chunks").delete().eq("server_id", found.id)).error,
    );
    must(
      "regions",
      (await db.from("map_regions").delete().eq("server_id", found.id)).error,
    );
    must(
      "server",
      (await db.from("bridge_servers").delete().eq("id", found.id)).error,
    );
  }
  must(
    "markers",
    (
      await db
        .from("map_markers")
        .delete()
        .eq("author_id", await demoAuthor())
    ).error,
  );
  console.log("cleaned");
  process.exit(0);
}
let serverId = found?.id as string | undefined;
if (!serverId) {
  const { data, error } = await db
    .from("bridge_servers")
    .insert({ name: NAME })
    .select("id")
    .single();
  if (error) throw error;
  serverId = data.id as string;
}

// value noise
const hash = (x: number, z: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, z: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const fbm = (x: number, z: number) =>
  noise(x / 60, z / 60) * 0.55 +
  noise(x / 25, z / 25) * 0.3 +
  noise(x / 11, z / 11) * 0.15;

// vanilla map colours (MapColor), as the plugin reads them from the blocks
const MAP = {
  grass: 0xff7fb238,
  plant: 0xff007c00, // leaves, tall grass, ferns
  sand: 0xfff7e9a3,
  stone: 0xff707070,
  snow: 0xffffffff,
  dirt: 0xff976d4d,
  wood: 0xff8f7748,
  terracotta: 0xff9f5224, // roofs
  water: 0xff4040ff,
};

// A made-up island that reads like a real world on the map: grass speckled with plants, trees whose
// crowns stand above the ground, beaches, a lake, a river, a hill range with snow and a small village.
function column(x: number, z: number): Column {
  const d = Math.hypot(x - 20, z + 10) / 230;
  const land = 0.78 - d * 0.95 + (fbm(x, z) - 0.5) * 0.7;
  const ground = Math.floor(
    63 + Math.max(0, land) * 10 + (fbm(x + 50, z - 70) - 0.5) * 4,
  );
  const lake = Math.hypot(x + 70, z - 40) - (34 + noise(x / 9, z / 9) * 8);
  const riverOff = Math.abs(z - (x * 0.35 + 30 + Math.sin(x / 31) * 14));
  const river = riverOff < 2.6 && x > -40 && x < 190;
  const speck = hash(x, z);

  if (land < 0.18) {
    // the sea gets deeper away from the shore
    const depth = Math.max(1, Math.min(30, Math.round((0.18 - land) * 60)));
    return { height: 62, color: MAP.water, waterDepth: depth };
  }
  if (lake < 0) {
    const depth = Math.max(1, Math.min(12, Math.round(-lake / 3)));
    return { height: 62, color: MAP.water, waterDepth: depth };
  }
  if (river)
    return { height: 62, color: MAP.water, waterDepth: riverOff < 1.2 ? 3 : 1 };

  const hill =
    Math.max(0, 1 - Math.hypot(x - 120, z + 90) / 95) * 46 +
    Math.max(0, fbm(x + 400, z) - 0.55) * 60;
  const height = ground + Math.floor(hill);

  // village: scattered houses with roofs along one street
  if (Math.hypot(x - 10, z - 20) < 30) {
    const hx = Math.floor((x + 3) / 9);
    const hz = Math.floor((z + 3) / 11);
    const jx = Math.floor(hash(hx, hz + 40) * 3);
    const jz = Math.floor(hash(hx + 40, hz) * 3);
    const lx = ((((x + 3) % 9) + 9) % 9) - jx;
    const lz = ((((z + 3) % 11) + 11) % 11) - jz;
    const isHouse =
      hash(hx, hz) > 0.45 && lx >= 1 && lx <= 5 && lz >= 1 && lz <= 4;
    if (isHouse) {
      const roof = lz === 2 || lz === 3 ? 1 : 0;
      return {
        height: height + 4 + roof,
        color: lx === 1 || lx === 5 ? MAP.wood : MAP.terracotta,
        waterDepth: 0,
      };
    }
    if (Math.abs(z - 22 - Math.sin(x / 9) * 2) < 1.5)
      return { height, color: MAP.dirt, waterDepth: 0 };
  }
  // a track across the island
  const track =
    Math.abs(z - 20 - (x - 10) * 0.12 - Math.sin(x / 20) * 3) < 1.2 &&
    x > -150 &&
    x < 150;
  if (track) return { height, color: MAP.dirt, waterDepth: 0 };

  if (land < 0.235) return { height, color: MAP.sand, waterDepth: 0 };
  if (hill > 40)
    return {
      height,
      color: speck > 0.15 ? MAP.snow : MAP.stone,
      waterDepth: 0,
    };
  if (hill > 24)
    return {
      height,
      color: speck > 0.75 ? MAP.grass : MAP.stone,
      waterDepth: 0,
    };

  // trees on a jittered grid; a forest holds them close together
  const forest = fbm(x + 900, z - 300) > 0.5;
  const cell = forest ? 5 : 13;
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gz = cz + oz;
      if (!forest && hash(gx * 7, gz * 3) > 0.35) continue;
      const tx = gx * cell + Math.floor(hash(gx, gz + 99) * cell);
      const tz = gz * cell + Math.floor(hash(gx + 99, gz) * cell);
      const r = 1.6 + hash(gx + 5, gz + 7) * 1.3;
      const dist = Math.hypot(x - tx, z - tz);
      if (dist <= r) {
        return {
          height: height + 5 + Math.round((r - dist) * 1.2),
          color: MAP.plant,
          waterDepth: 0,
        };
      }
    }
  }
  // grass with tall grass and ferns scattered in it
  return {
    height,
    color: speck < (forest ? 0.45 : 0.28) ? MAP.plant : MAP.grass,
    waterDepth: 0,
  };
}

const R = 16; // chunks from the middle in each direction: a 512 x 512 block area
const batch: object[] = [];
let sent = 0;
const flush = async () => {
  if (!batch.length) return;
  const { error } = await db.rpc("map_ingest_chunks", {
    p_server_id: serverId,
    p_chunks: batch,
  });
  if (error) throw error;
  sent += batch.length;
  batch.length = 0;
};
for (let cz = -R; cz < R; cz++) {
  for (let cx = -R; cx < R; cx++) {
    const columns: Column[] = [];
    for (let i = 0; i < COLUMNS; i++) {
      columns.push(column(cx * 16 + (i % 16), cz * 16 + Math.floor(i / 16)));
    }
    batch.push({
      dim: "overworld",
      cx,
      cz,
      codec: 2,
      version: Date.now(),
      data: encodeChunk({ columns }).toString("base64"),
    });
    if (batch.length === 50) await flush();
  }
}
await flush();
console.log("seeded", sent, "chunks for server", serverId);

// public, approved markers and a few place names over the island, as players would leave them
const author = await demoAuthor();
must(
  "old markers",
  (await db.from("map_markers").delete().eq("author_id", author)).error,
);
const markers: [string, string, string | null, number, number, string][] = [
  ["Деревня", "house", null, 12, 22, "Дома у реки, рынок по субботам."],
  ["Мельница", "windmill", null, -48, 64, ""],
  ["Крепость", "castle", null, 118, -36, "Стены ещё строятся."],
  ["Портал в Незер", "portal", null, 64, 108, ""],
  ["Клад", "chest", "#e0b03a", -118, -58, "Под старым дубом."],
  ["Порт", "anchor", null, -150, 58, ""],
  ["Логово криперов", "creeper", "#4e8a34", 160, 88, "Ходить только днём."],
  ["Точка сбора", "star", "#d35a2a", 2, -96, "Встречаемся здесь по вечерам."],
  ["Шахта", "mine", null, 136, -98, "Алмазы глубоко внизу."],
];
const labels: [string, number, number][] = [
  ["Снежный хребет", 120, -120],
  ["Тихое озеро", -72, 40],
];
must(
  "markers",
  (
    await db.from("map_markers").insert([
      ...markers.map(([name, icon, color, x, z, description]) => ({
        author_id: author,
        kind: "point",
        dim: "overworld",
        x,
        z,
        name,
        description,
        icon,
        color,
        visibility: "public",
        moderation_status: "approved",
      })),
      ...labels.map(([name, x, z]) => ({
        author_id: author,
        kind: "label",
        dim: "overworld",
        x,
        z,
        name,
        description: "",
        icon: "pin",
        color: null,
        visibility: "public",
        moderation_status: "approved",
      })),
    ])
  ).error,
);
console.log("seeded", markers.length + labels.length, "markers");
