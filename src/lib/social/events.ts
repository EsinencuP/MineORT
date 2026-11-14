import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import type { Viewer } from "./viewer";

export const EVENT_CATEGORIES = {
  build: "Стройка",
  meetup: "Встреча",
  contest: "Конкурс",
  other: "Другое",
} as const;
export type EventCategory = keyof typeof EVENT_CATEGORIES;

const RPC_ERRORS = new Set([
  "event_not_found",
  "event_cancelled",
  "event_past",
  "event_already_joined",
  "event_full",
  "forbidden",
]);

export type EventView = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  place: string;
  category: EventCategory;
  seatsLimit: number | null;
  attendees: number;
  joined: boolean;
  organizerId: string;
  organizerName: string;
  organizerTz: string;
  cancelled: boolean;
  cancelReason: string | null;
  rescheduledFrom: string | null;
  past: boolean;
  /** Organizer or staff: may reschedule and cancel. */
  canManage: boolean;
};

export type NewEvent = {
  title: string;
  description: string;
  startsAt: string;
  tz: string;
  durationMinutes: number;
  place: string;
  category: string;
  seatsLimit: number | null;
};

async function within(key: string, windowSeconds: number, limit: number) {
  const { data, error } = await db().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });
  if (error) throw new Error(`hit_rate_limit: ${error.message}`);
  return data === true;
}

/** Only real IANA zone names are stored. */
function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export async function createEvent(viewer: Viewer, input: NewEvent) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("event_forbidden");
  const title = input.title.trim();
  const start = Date.parse(input.startsAt);
  const duration = Math.trunc(input.durationMinutes);
  if (title.length < 3 || title.length > 120)
    throw new SocialError("event_invalid");
  if (input.description.length > 2000 || input.place.length > 120)
    throw new SocialError("event_invalid");
  if (!Number.isFinite(duration) || duration < 15 || duration > 1440)
    throw new SocialError("event_invalid");
  if (!Number.isFinite(start)) throw new SocialError("event_invalid");
  if (start <= Date.now()) throw new SocialError("event_past_date");
  const category: EventCategory =
    input.category in EVENT_CATEGORIES
      ? (input.category as EventCategory)
      : "other";
  const seats =
    input.seatsLimit && input.seatsLimit >= 1 && input.seatsLimit <= 500
      ? Math.trunc(input.seatsLimit)
      : null;
  if (!(await within(`event:${viewer.userId}`, 3600, 10)))
    throw new SocialError("post_rate_limited");

  const { data, error } = await db()
    .from("events")
    .insert({
      organizer_id: viewer.userId,
      title,
      description: input.description.trim(),
      starts_at: new Date(start).toISOString(),
      duration_minutes: duration,
      organizer_tz: validZone(input.tz),
      place: input.place.trim(),
      category,
      seats_limit: seats,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`event insert: ${error?.message}`);
  // the organizer takes part by default
  await db()
    .from("event_attendees")
    .insert({ event_id: data.id, user_id: viewer.userId });
  return data.id as string;
}

type Row = Record<string, unknown>;

async function hydrate(rows: Row[], viewer: Viewer): Promise<EventView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [{ data: att }, { data: orgs }] = await Promise.all([
    db()
      .from("event_attendees")
      .select("event_id, user_id")
      .in("event_id", ids),
    db()
      .from("users")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((r) => r.organizer_id as string))]),
  ]);
  const orgName = new Map(
    (orgs ?? []).map((o) => [
      o.id as string,
      (o.display_name as string | null) ?? "Организатор",
    ]),
  );
  return rows.map((r) => {
    const mine = (att ?? []).filter((a) => a.event_id === r.id);
    const start = Date.parse(r.starts_at as string);
    const duration = r.duration_minutes as number;
    return {
      id: r.id as string,
      title: r.title as string,
      description: r.description as string,
      startsAt: r.starts_at as string,
      durationMinutes: duration,
      place: r.place as string,
      category: r.category as EventCategory,
      seatsLimit: (r.seats_limit as number | null) ?? null,
      attendees: mine.length,
      joined: mine.some((a) => a.user_id === viewer.userId),
      organizerId: r.organizer_id as string,
      organizerName: orgName.get(r.organizer_id as string) ?? "Организатор",
      organizerTz: r.organizer_tz as string,
      cancelled: r.cancelled_at !== null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
      rescheduledFrom: (r.rescheduled_from as string | null) ?? null,
      past: start + duration * 60_000 <= Date.now(),
      canManage: r.organizer_id === viewer.userId || viewer.canModerate,
    };
  });
}

const COLUMNS =
  "id, organizer_id, title, description, starts_at, duration_minutes, organizer_tz, place, category, seats_limit, cancelled_at, cancel_reason, rescheduled_from";

/** Events that start inside [from, to), soonest first. */
export async function listEventsBetween(viewer: Viewer, from: Date, to: Date) {
  const { data, error } = await db()
    .from("events")
    .select(COLUMNS)
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at")
    .limit(200);
  if (error) throw new Error(`events: ${error.message}`);
  return hydrate(data ?? [], viewer);
}

/** Upcoming (and currently running) events for the chronological list. */
export async function listUpcoming(viewer: Viewer, limit = 50) {
  const { data, error } = await db()
    .from("events")
    .select(COLUMNS)
    .gte("starts_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("starts_at")
    .limit(limit + 20);
  if (error) throw new Error(`events: ${error.message}`);
  const all = await hydrate(data ?? [], viewer);
  return all.filter((e) => !e.past).slice(0, limit);
}

export async function nextEvent(viewer: Viewer) {
  const [first] = await listUpcoming(viewer, 5).then((l) =>
    l.filter((e) => !e.cancelled),
  );
  return first ?? null;
}

async function mapRpc(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (RPC_ERRORS.has(error.message))
    throw new SocialError(
      error.message === "forbidden" ? "event_forbidden" : error.message,
    );
  throw new Error(`event rpc: ${error.message}`);
}

export async function joinEvent(viewer: Viewer, eventId: string) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("event_forbidden");
  const { error } = await db().rpc("join_event", {
    p_user: viewer.userId,
    p_event: eventId,
  });
  await mapRpc(error);
}

export async function leaveEvent(viewer: Viewer, eventId: string) {
  if (!viewer.userId || viewer.cls === "guest")
    throw new SocialError("event_forbidden");
  await db()
    .from("event_attendees")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", viewer.userId);
}

async function manageable(viewer: Viewer, eventId: string) {
  if (!viewer.userId) throw new SocialError("event_forbidden");
  const { data: e } = await db()
    .from("events")
    .select("id, organizer_id, starts_at, duration_minutes, cancelled_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!e) throw new SocialError("event_not_found");
  const own = e.organizer_id === viewer.userId;
  if (!own && !viewer.canModerate) throw new SocialError("event_forbidden");
  if (e.cancelled_at) throw new SocialError("event_cancelled");
  if (
    Date.parse(e.starts_at as string) +
      (e.duration_minutes as number) * 60_000 <=
    Date.now()
  )
    throw new SocialError("event_past");
  return { own, startsAt: e.starts_at as string };
}

export async function rescheduleEvent(
  viewer: Viewer,
  eventId: string,
  startsAt: string,
) {
  const { own, startsAt: old } = await manageable(viewer, eventId);
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new SocialError("event_invalid");
  if (start <= Date.now()) throw new SocialError("event_past_date");
  await db()
    .from("events")
    .update({ starts_at: new Date(start).toISOString(), rescheduled_from: old })
    .eq("id", eventId);
  await writeAudit(
    viewer.userId!,
    own ? "event.rescheduled" : "event.rescheduled_by_moderator",
    { event_id: eventId, from: old, to: new Date(start).toISOString() },
  );
}

export async function cancelEvent(
  viewer: Viewer,
  eventId: string,
  reason: string,
) {
  const { own } = await manageable(viewer, eventId);
  const text = reason.trim();
  if (!own && text.length < 3) throw new SocialError("reason_too_short");
  await db()
    .from("events")
    .update({
      cancelled_at: new Date().toISOString(),
      cancel_reason: text || null,
    })
    .eq("id", eventId);
  await writeAudit(
    viewer.userId!,
    own ? "event.cancelled" : "event.cancelled_by_moderator",
    { event_id: eventId, reason: text || null },
  );
}
