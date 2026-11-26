import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import {
  parsePositions,
  groupByTopic,
  type Resolved,
} from "@/lib/map/positions";
import { broadcast } from "@/lib/map/realtime";
import { recordTrailPositions } from "@/lib/map/trails";
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
 * Where the players are, as the Paper plugin sees it. Sampled points go to trail history and
 * the current batch goes to private channels. The plugin sends every second while watched
 * and every five seconds otherwise so idle trail history still keeps its time resolution.
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
    db().rpc("map_live_player_audience"),
    db().rpc("map_resolve_players", { p_uuids: positions.map((p) => p.uuid) }),
    recordTrailPositions(auth.serverId, positions),
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
  const staffDots = groups.get(TOPIC_ADMIN) ?? [];
  const moderatorDots = staffDots.map(({ n, d, x, z, r }) => ({
    n,
    d,
    x,
    z,
    r,
  }));
  const positionsByNickname = new Map(moderatorDots.map((dot) => [dot.n, dot]));
  try {
    const messages = (
      audience.data as {
        session_id: string;
        guild_id: string | null;
        staff: boolean;
        show_coordinates: boolean;
        player_nickname: string | null;
      }[]
    ).map((viewer) => {
      const publicDots = groups.get(TOPIC_ALL) ?? [];
      const guildDots = viewer.guild_id
        ? (groups.get(guildTopic(viewer.guild_id)) ?? [])
        : [];
      const own = viewer.player_nickname
        ? positionsByNickname.get(viewer.player_nickname)
        : undefined;
      const dots = viewer.staff
        ? viewer.show_coordinates
          ? staffDots
          : moderatorDots
        : [
            ...new Map(
              [...publicDots, ...guildDots, ...(own ? [own] : [])].map(
                (dot) => [dot.n, dot],
              ),
            ).values(),
          ];
      return {
        topic: sessionTopic(viewer.session_id),
        event: "pos",
        payload: { t: now, p: dots, staff: viewer.show_coordinates },
      };
    });
    // one request per 15 viewers, all at once: with many viewers a serial chain would outlast
    // the one-second cadence of the plugin
    const batches = [];
    for (let i = 0; i < messages.length; i += 15)
      batches.push(broadcast(messages.slice(i, i + 15)));
    const failed = (await Promise.allSettled(batches)).find(
      (r) => r.status === "rejected",
    );
    if (failed) throw (failed as PromiseRejectedResult).reason;
  } catch (e) {
    // positions are perishable: the next batch replaces this one, so a failed push is logged only
    console.error("map position broadcast failed", e);
  }
  return bridgeJson({ interval_ms: FAST_INTERVAL_MS });
}
