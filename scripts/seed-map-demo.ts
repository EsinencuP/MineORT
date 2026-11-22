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
  sand: 0xfff7e9a3,
  stone: 0xff707070,
  snow: 0xffffffff,
  dirt: 0xff976d4d,
  wood: 0xff8f7748,
  plant: 0xff007c00,
  water: 0xff4040ff,
};

// an island around (0, 0) of about 440 blocks across, with a lake, a river, a hill range and a village
function column(x: number, z: number): Column {
  const d = Math.hypot(x - 20, z + 10) / 230;
  const land = 0.78 - d * 0.95 + (fbm(x, z) - 0.5) * 0.7;
  const lake = Math.hypot(x + 70, z - 40) < 34 + noise(x / 9, z / 9) * 8;
  const river =
    Math.abs(z - (x * 0.35 + 30 + Math.sin(x / 31) * 14)) < 2.4 &&
    x > -40 &&
    x < 190;
  if (land < 0.18) {
    const deep = land < 0.04;
    return {
      height: deep ? 50 : 61,
      color: MAP.water,
      waterDepth: deep ? 12 : 3,
    };
  }
  if (lake || river) return { height: 62, color: MAP.water, waterDepth: 2 };
  const hill =
    Math.max(0, 1 - Math.hypot(x - 120, z + 90) / 95) * 46 +
    Math.max(0, fbm(x + 400, z) - 0.55) * 60;
  const height = Math.floor(64 + land * 6 + hill);
  const village =
    Math.hypot(x - 10, z - 20) < 28 &&
    hash(Math.floor(x / 6), Math.floor(z / 6)) > 0.45;
  if (village) return { height, color: MAP.wood, waterDepth: 0 };
  const track =
    Math.abs(z - 20 - (x - 10) * 0.12 - Math.sin(x / 20) * 3) < 1.2 &&
    x > -150 &&
    x < 150;
  if (track) return { height, color: MAP.dirt, waterDepth: 0 };
  if (land < 0.24) return { height, color: MAP.sand, waterDepth: 0 };
  if (hill > 26)
    return {
      height,
      color: hill > 40 ? MAP.snow : MAP.stone,
      waterDepth: 0,
    };
  const forest = fbm(x + 900, z - 300) > 0.52;
  return {
    height,
    color: forest ? MAP.plant : MAP.grass,
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
