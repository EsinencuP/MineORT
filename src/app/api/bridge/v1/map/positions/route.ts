import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import {
  parsePositions,
  groupByTopic,
  type Resolved,
} from "@/lib/map/positions";
import { broadcast } from "@/lib/map/realtime";
import {
  hasViewers,
  SLOW_INTERVAL_MS,
  FAST_INTERVAL_MS,
} from "@/lib/map/viewers";
import type { MapVisibility } from "@/lib/map/visibility";
import { db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Where the players are, as the Paper plugin sees it. Nothing is stored: each batch is split by
 * who may see whom and pushed to the private channels. The answer tells the plugin how often to
 * send the next batch (every second while someone has the map open, every 10 seconds otherwise).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  let positions: ReturnType<typeof parsePositions>;
  try {
    positions = parsePositions(JSON.parse(raw).players);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  const watched = await hasViewers();
  const interval = watched ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
  if (positions.length === 0) return bridgeJson({ interval_ms: interval });

  const { data, error } = await db().rpc("map_resolve_players", {
    p_uuids: positions.map((p) => p.uuid),
  });
  if (error) throw new Error(`map_resolve_players: ${error.message}`);
  const resolved = new Map<string, Resolved>();
  for (const row of data as {
    out_mc_uuid: string;
    out_nickname: string;
    out_visibility: string;
    out_guild_id: string | null;
  }[]) {
    resolved.set(row.out_mc_uuid, {
      nickname: row.out_nickname,
      visibility: row.out_visibility as MapVisibility,
      guildId: row.out_guild_id,
    });
  }

  const now = Date.now();
  try {
    await broadcast(
      [...groupByTopic(positions, resolved)].map(([topic, p]) => ({
        topic,
        event: "pos",
        payload: { t: now, p },
      })),
    );
  } catch (e) {
    // positions are perishable: the next batch replaces this one, so a failed push is logged only
    console.error("map position broadcast failed", e);
  }
  return bridgeJson({ interval_ms: interval });
}
