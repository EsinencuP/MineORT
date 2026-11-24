import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { communityPlayer } from "@/lib/community/player";
import {
  parseDiscoveredRegions,
  parseStatValues,
  progressEnabled,
} from "@/lib/community/progress";
import { EVENT_ID } from "@/lib/social/events";
import { db } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!progressEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: { events?: unknown } | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  if (
    !Array.isArray(input?.events) ||
    !input.events.length ||
    input.events.length > 100
  )
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  const result = [];
  const players = new Map<string, ReturnType<typeof communityPlayer>>();
  for (const item of input.events) {
    const id = item?.event_id;
    const uuid = item?.player_uuid;
    const values =
      item?.values === undefined ? {} : parseStatValues(item.values);
    const regions = parseDiscoveredRegions(item?.regions);
    const when =
      typeof item?.occurred_at === "string"
        ? Date.parse(item.occurred_at)
        : NaN;
    if (
      typeof id !== "string" ||
      !EVENT_ID.test(id) ||
      typeof uuid !== "string" ||
      !EVENT_ID.test(uuid) ||
      !values ||
      !regions ||
      (!Object.keys(values).length && !regions.length) ||
      !Number.isFinite(when) ||
      when > Date.now() + 300_000
    ) {
      result.push({ event_id: id, result: "rejected", code: "ERR_BAD_EVENT" });
      continue;
    }
    let lookup = players.get(uuid);
    if (!lookup) {
      lookup = communityPlayer(uuid);
      players.set(uuid, lookup);
    }
    const player = await lookup;
    if (!player) {
      result.push({
        event_id: id,
        result: "rejected",
        code: "ERR_PLAYER_NOT_FOUND",
      });
      continue;
    }
    const { data, error } = await db().rpc("game_record_stats", {
      p_server: auth.serverId,
      p_event: id,
      p_user: player.userId,
      p_time: new Date(when).toISOString(),
      p_values: values,
      p_regions: regions,
    });
    if (error) throw new Error(`game stats: ${error.message}`);
    result.push({ event_id: id, result: data ? "accepted" : "duplicate" });
  }
  return bridgeJson({ results: result });
}
