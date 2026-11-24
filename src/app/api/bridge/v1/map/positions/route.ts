import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import {
  parsePositions,
  groupByTopic,
  type Resolved,
} from "@/lib/map/positions";
import { broadcast } from "@/lib/map/realtime";
import { SLOW_INTERVAL_MS, FAST_INTERVAL_MS } from "@/lib/map/viewers";
import {
  guildTopic,
  sessionTopic,
  TOPIC_ADMIN,
  TOPIC_ALL,
  type MapVisibility,
} from "@/lib/map/visibility";
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

  const [audience, { data, error }] = await Promise.all([
    db().rpc("map_live_audience"),
    db().rpc("map_resolve_players", { p_uuids: positions.map((p) => p.uuid) }),
  ]);
  if (audience.error)
    throw new Error(`map live audience: ${audience.error.message}`);
  if (audience.data.length === 0)
    return bridgeJson({ interval_ms: SLOW_INTERVAL_MS });
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
  const groups = groupByTopic(positions, resolved);
  try {
    const messages = (
      audience.data as {
        session_id: string;
        guild_id: string | null;
        staff: boolean;
      }[]
    ).map((viewer) => {
      const publicDots = groups.get(TOPIC_ALL) ?? [];
      const guildDots = viewer.guild_id
        ? (groups.get(guildTopic(viewer.guild_id)) ?? [])
        : [];
      const dots = viewer.staff
        ? (groups.get(TOPIC_ADMIN) ?? [])
        : [
            ...new Map(
              [...publicDots, ...guildDots].map((dot) => [dot.n, dot]),
            ).values(),
          ];
      return {
        topic: sessionTopic(viewer.session_id),
        event: "pos",
        payload: { t: now, p: dots, staff: viewer.staff },
      };
    });
    for (let i = 0; i < messages.length; i += 15)
      await broadcast(messages.slice(i, i + 15));
  } catch (e) {
    // positions are perishable: the next batch replaces this one, so a failed push is logged only
    console.error("map position broadcast failed", e);
  }
  return bridgeJson({ interval_ms: FAST_INTERVAL_MS });
}
