import { notFound } from "next/navigation";
import { inviteEventPlayerAction } from "@/app/actions/social";
import { EventCard } from "@/components/social/event-card";
import { RaidContributions } from "@/components/social/raid-contributions";
import { ThreadLink } from "@/components/social/thread-controls";
import { PendingButton } from "@/components/social/pending-button";
import { discussionsEnabled } from "@/lib/community/discussions";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { isEnabled } from "@/lib/flags";
import { getMarker, getMarkerViewer } from "@/lib/map/markers";
import { calendarEnabled, eventPath, getEvent } from "@/lib/social/events";
import { getViewer } from "@/lib/social/viewer";

export const metadata = { title: "Событие MineOrt" };

export default async function EventPage({
  params,
  searchParams,
}: PageProps<"/social/calendar/[id]">) {
  if (!calendarEnabled()) notFound();
  const [{ id }, viewer, feedback] = await Promise.all([
    params,
    getViewer(),
    searchParams,
  ]);
  const event = await getEvent(viewer, id);
  if (!event) notFound();
  const marker =
    event.markerId && isEnabled("ff_p1c_atlas")
      ? await getMarker(await getMarkerViewer(), event.markerId)
      : null;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="sr-only">{event.title}</h1>
      <div>
        <ButtonLink href="/social/calendar" variant="ghost">
          ← События
        </ButtonLink>
      </div>
      <Notice
        error={feedback.error}
        ok={feedback.ok}
        okTexts={{
          contribution: "Вклад сохранён.",
          invited: "Приглашение отправлено.",
        }}
      />
      <EventCard
        event={event}
        viewer={viewer}
        back={eventPath(id)}
        advanced
        detail
        mapHref={
          marker
            ? `/map?m=${marker.id}&back=${encodeURIComponent(eventPath(id))}`
            : undefined
        }
      />
      {discussionsEnabled() && <ThreadLink type="event" id={id} />}
      {viewer.canPublish &&
        viewer.userId === event.organizerId &&
        !event.cancelled &&
        !event.started && (
          <form
            action={inviteEventPlayerAction}
            className="flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="event_id" value={id} />
            <input type="hidden" name="return_to" value={eventPath(id)} />
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              Ник игрока
              <input
                name="nick"
                required
                pattern="[A-Za-z0-9_]{3,16}"
                className="border-line bg-paper min-h-11 min-w-0 rounded-xl border px-3"
              />
            </label>
            <PendingButton>Пригласить</PendingButton>
          </form>
        )}
      <RaidContributions event={event} viewer={viewer} />
    </div>
  );
}
