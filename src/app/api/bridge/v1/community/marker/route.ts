import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { isEnabled } from "@/lib/flags";
import { communityPlayer } from "@/lib/community/player";
import { parseMarkerInput } from "@/lib/map/marker-rules";
import { EVENT_ID } from "@/lib/social/events";
import { db } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!isEnabled("ff_p1c_atlas")) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: Record<string, unknown> | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const marker = parseMarkerInput({
    ...input,
    visibility: "private",
    kind: "point",
    icon: "pin",
  });
  const when =
    typeof input?.occurred_at === "string"
      ? Date.parse(input.occurred_at)
      : NaN;
  if (
    !input ||
    typeof input.event_id !== "string" ||
    !EVENT_ID.test(input.event_id) ||
    !marker ||
    !Number.isFinite(when)
  ) {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const player = await communityPlayer(input.player_uuid);
  if (!player) return bridgeJson({ error: "ERR_PLAYER_NOT_FOUND" }, 404);
  const { data, error } = await db().rpc("create_game_marker", {
    p_server: auth.serverId,
    p_event: input.event_id,
    p_user: player.userId,
    p_time: new Date(when).toISOString(),
    p_dim: marker.dim,
    p_x: marker.x,
    p_z: marker.z,
    p_y: marker.y,
    p_name: marker.name,
  });
  if (error?.code === "P0001") return bridgeJson({ error: error.message }, 429);
  if (error) throw new Error(`game marker: ${error.message}`);
  return bridgeJson({
    marker_id: data,
    url: new URL(`/map?m=${data}`, process.env.APP_URL || req.nextUrl.origin)
      .href,
  });
}
