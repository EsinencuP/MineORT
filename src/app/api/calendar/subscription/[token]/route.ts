import { calendarSubscriber } from "@/lib/social/calendar-token";
import { calendarEnabled, listJoinedEvents } from "@/lib/social/events";
import { calendarResponse, renderCalendar } from "@/lib/social/ical";

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/calendar/subscription/[token]">,
) {
  if (!calendarEnabled()) return new Response(null, { status: 404 });
  const { token } = await ctx.params;
  const userId = await calendarSubscriber(token);
  if (!userId)
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  const events = await listJoinedEvents(userId);
  return calendarResponse(
    renderCalendar(
      events,
      process.env.APP_URL || new URL(req.url).origin,
      true,
    ),
    "mineort-events.ics",
  );
}
