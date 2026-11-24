import { deliverTelegramNotifications } from "@/lib/community/delivery";
import {
  maintainWaitlists,
  notificationsEnabled,
} from "@/lib/community/notifications";
import { calendarEnabled } from "@/lib/social/events";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    request.headers.get("authorization") !== `Bearer ${secret}` ||
    (!notificationsEnabled() && !calendarEnabled())
  )
    return new Response(null, { status: 404 });
  await maintainWaitlists();
  const sent = notificationsEnabled()
    ? await deliverTelegramNotifications()
    : 0;
  return Response.json({ sent }, { headers: { "Cache-Control": "no-store" } });
}
