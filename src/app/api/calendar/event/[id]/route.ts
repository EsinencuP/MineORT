import { calendarEnabled, getEvent } from "@/lib/social/events";
import { calendarResponse, renderCalendar } from "@/lib/social/ical";
import { getViewer } from "@/lib/social/viewer";

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/calendar/event/[id]">,
) {
  if (!calendarEnabled()) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  const event = await getEvent(await getViewer(), id);
  if (!event) return new Response(null, { status: 404 });
  return calendarResponse(
    renderCalendar([event], process.env.APP_URL || new URL(req.url).origin),
    "mineort-event.ics",
  );
}
