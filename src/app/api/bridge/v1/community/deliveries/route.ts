import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import {
  mutedScopes,
  notificationLabels,
  notificationPreferences,
  notificationsEnabled,
  notificationTarget,
  visibleOnChannel,
  type Notification,
} from "@/lib/community/notifications";
import { communityPlayer } from "@/lib/community/player";
import { smsMessage } from "@/lib/community/sms";
import { EVENT_ID } from "@/lib/social/events";
import type { Viewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  if (!notificationsEnabled()) return new Response(null, { status: 404 });
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;
  let input: { player_uuid?: unknown; acknowledged?: unknown } | null;
  try {
    input = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  const player = await communityPlayer(input?.player_uuid);
  if (!player) return bridgeJson({ error: "ERR_PLAYER_NOT_FOUND" }, 404);
  const acknowledgements = input?.acknowledged ?? [];
  if (!Array.isArray(acknowledgements) || acknowledgements.length > 20)
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  const userId = player.userId;
  const finish = async (
    notificationId: string,
    leaseId: string,
    delivered: boolean,
  ) => {
    const { error } = await db().rpc("finish_game_delivery", {
      p_user: userId,
      p_notification: notificationId,
      p_lease: leaseId,
      p_delivered: delivered,
    });
    if (error) throw new Error(`ack game delivery: ${error.message}`);
  };
  for (const ack of acknowledgements) {
    if (
      typeof ack?.id !== "string" ||
      !EVENT_ID.test(ack.id) ||
      typeof ack.lease !== "string" ||
      !EVENT_ID.test(ack.lease)
    )
      return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  await Promise.all(
    acknowledgements.map((ack) => finish(ack.id, ack.lease, true)),
  );
  const [prefs, muted, items] = await Promise.all([
    notificationPreferences(userId),
    mutedScopes(userId),
    db().rpc("claim_game_deliveries", { p_user: userId }),
  ]);
  if (items.error)
    throw new Error(`claim game notifications: ${items.error.message}`);
  const viewer: Viewer = {
    userId,
    cls: "member",
    canPublish: true,
    canModerate: false,
  };
  const leases = items.data as { item: Notification; lease_id: string }[];
  const results = await Promise.all(
    leases.map(async ({ item, lease_id: lease }) => {
      const target = visibleOnChannel(item, prefs, muted, "minecraft")
        ? await notificationTarget(item, viewer)
        : null;
      if (!target || muted.has(target.scope)) {
        await finish(item.id, lease, false);
        return null;
      }
      const sms =
        item.kind === "sms"
          ? await smsMessage(userId, item.target_id, true)
          : null;
      if (item.kind === "sms" && !sms) {
        await finish(item.id, lease, false);
        return null;
      }
      return {
        id: item.id,
        lease,
        kind: item.kind,
        text: sms
          ? `${sms.sender}: ${sms.body}`
          : `${notificationLabels[item.kind] ?? "MineOrt"}: ${target.title}`,
        url: sms
          ? undefined
          : new URL(target.href, process.env.APP_URL || req.nextUrl.origin)
              .href,
      };
    }),
  );
  return bridgeJson({ deliveries: results.filter(Boolean) });
}
