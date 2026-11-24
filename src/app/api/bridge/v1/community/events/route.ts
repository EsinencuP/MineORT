import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { communityPlayer } from "@/lib/community/player";
import {
  calendarEnabled,
  eventPath,
  listJoinedEvents,
} from "@/lib/social/events";

export async function POST(req: NextRequest) {
  if (!calendarEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: { player_uuid?: unknown } | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const player = await communityPlayer(input?.player_uuid);
  if (!player) return bridgeJson({ error: "ERR_PLAYER_NOT_FOUND" }, 404);
  const events = (await listJoinedEvents(player.userId, 100))
    .filter((event) => !event.past && !event.cancelled)
    .slice(0, 10);
  return bridgeJson({
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      url: new URL(
        eventPath(event.id),
        process.env.APP_URL || req.nextUrl.origin,
      ).href,
    })),
  });
}
