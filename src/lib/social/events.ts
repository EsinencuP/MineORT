import "server-only";
import { writeAudit } from "@/lib/audit";
import { getMarker, getMarkerViewer } from "@/lib/map/markers";
import { isEnabled } from "@/lib/flags";
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
  "event_offer_expired",
  "event_invite_unavailable",
  "post_rate_limited",
  "forbidden",
]);

export type EventView = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
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
  started: boolean;
  /** Organizer or staff: may reschedule and cancel. */
  canManage: boolean;
  visibility: EventVisibility;
  markerId: string | null;
  projectId: string | null;
  sequence: number;
  updatedAt: string;
  reserved: number;
  waiting: boolean;
  offeredUntil: string | null;
};

export type EventVisibility = "public" | "signed_in" | "guild" | "private";
const VISIBILITIES = new Set(["public", "signed_in", "guild", "private"]);
export const EVENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const eventPath = (id: string) => `/social/calendar/${id}`;

export function seatHoldSeconds() {
  const configured = Number(process.env.EVENT_SEAT_HOLD_SECONDS);
  return Number.isInteger(configured) && configured >= 60 && configured <= 86400
    ? configured
    : 900;
}

export type NewEvent = {
  title: string;
  description: string;
  startsAt: string;
  tz: string;
  durationMinutes: number;
  place: string;
  category: string;
  seatsLimit: number | null;
  endsAt?: string;
  visibility?: string;
  markerId?: string;
  projectId?: string;
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
  const duration = input.endsAt
    ? (Date.parse(input.endsAt) - start) / 60_000
    : Math.trunc(input.durationMinutes);
  if (title.length < 3 || title.length > 120)
    throw new SocialError("event_invalid");
  if (input.description.length > 2000 || input.place.length > 120)
    throw new SocialError("event_invalid");
  if (!Number.isInteger(duration) || duration < 15 || duration > 1440)
    throw new SocialError("event_invalid");
  if (!Number.isFinite(start)) throw new SocialError("event_invalid");
  if (start <= Date.now()) throw new SocialError("event_past_date");
  const category: EventCategory = Object.hasOwn(
    EVENT_CATEGORIES,
    input.category,
  )
    ? (input.category as EventCategory)
    : "other";
  const seats = input.seatsLimit;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > 500))
    throw new SocialError("event_invalid");
  if (!(await within(`event:${viewer.userId}`, 3600, 10)))
    throw new SocialError("post_rate_limited");
  const advanced = calendarEnabled();
  const visibility =
    advanced && input.visibility ? input.visibility : "signed_in";
  if (!VISIBILITIES.has(visibility)) throw new SocialError("event_invalid");
  let guildId: string | null = null;
  if (visibility === "guild") {
    const { data, error } = await db()
      .from("guild_members")
      .select("guild_id, guilds!inner(status)")
      .eq("user_id", viewer.userId)
      .eq("status", "active")
      .eq("guilds.status", "active")
      .maybeSingle();
    if (error) throw new Error(`event guild lookup: ${error.message}`);
    if (!data) throw new SocialError("event_invalid");
    guildId = data.guild_id;
  }
  const markerInput = advanced ? input.markerId : "";
  let markerId: string | null = markerInput || null;
  if (markerInput && !EVENT_ID.test(markerInput)) {
    const link = URL.parse(markerInput, "https://mineort.invalid");
    markerId = link?.pathname === "/map" ? link.searchParams.get("m") : null;
    if (!markerId) throw new SocialError("event_invalid");
  }
  if (
    markerId &&
    (!EVENT_ID.test(markerId) ||
      !isEnabled("ff_p1c_atlas") ||
      !(await getMarker(await getMarkerViewer(), markerId)))
  )
    throw new SocialError("event_invalid");

  const args = {
    p_user: viewer.userId,
    p_title: title,
    p_description: input.description.trim(),
    p_starts_at: new Date(start).toISOString(),
    p_duration: duration,
    p_tz: validZone(input.tz),
    p_place: input.place.trim(),
    p_category: category,
    p_seats: seats,
    p_visibility: visibility,
    p_guild: guildId,
    p_marker: markerId,
  };
  const projectUrl =
    advanced && isEnabled("ff_community_progress") && input.projectId
      ? URL.parse(input.projectId, "https://mineort.invalid")
      : null;
  const projectId = projectUrl
    ? /^\/social\/projects\/([a-f0-9-]+)$/i.exec(projectUrl.pathname)?.[1]
    : null;
  if (
    advanced &&
    isEnabled("ff_community_progress") &&
    input.projectId &&
    (!projectId || !EVENT_ID.test(projectId))
  )
    throw new SocialError("event_invalid");
  const { data, error } = projectId
    ? await db().rpc("create_raid_event", { ...args, p_project: projectId })
    : await db().rpc("create_calendar_event", args);
  if (error?.message === "event_project_forbidden")
    throw new SocialError(error.message);
  if (error || !data) throw new Error(`event insert: ${error?.message}`);
  return data as string;
}

type Row = Record<string, unknown>;

async function hydrate(rows: Row[], viewer: Viewer): Promise<EventView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [{ data: signups, error }, { data: orgs }] = await Promise.all([
    db().rpc("event_signup_summary", { p_ids: ids, p_user: viewer.userId }),
    db()
      .from("users")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((r) => r.organizer_id as string))]),
  ]);
  if (error) throw new Error(`event attendance: ${error.message}`);
  const attendance = new Map<
    string,
    {
      attendees: number;
      joined: boolean;
      reserved: number;
      waiting: boolean;
      offered_until: string | null;
    }
  >(signups.map((row: { event_id: string }) => [row.event_id, row]));
  const orgName = new Map(
    (orgs ?? []).map((o) => [
      o.id as string,
      (o.display_name as string | null) ?? "Организатор",
    ]),
  );
  const now = Date.now();
  return rows.map((r) => {
    const signup = attendance.get(r.id as string);
    const start = Date.parse(r.starts_at as string);
    const duration = r.duration_minutes as number;
    return {
      id: r.id as string,
      title: r.title as string,
      description: r.description as string,
      startsAt: r.starts_at as string,
      endsAt: new Date(start + duration * 60_000).toISOString(),
      durationMinutes: duration,
      place: r.place as string,
      category: r.category as EventCategory,
      seatsLimit: (r.seats_limit as number | null) ?? null,
      attendees: signup?.attendees ?? 0,
      joined: signup?.joined ?? false,
      organizerId: r.organizer_id as string,
      organizerName: orgName.get(r.organizer_id as string) ?? "Организатор",
      organizerTz: r.organizer_tz as string,
      cancelled: r.cancelled_at !== null,
      cancelReason: (r.cancel_reason as string | null) ?? null,
      rescheduledFrom: (r.rescheduled_from as string | null) ?? null,
      past: start + duration * 60_000 <= now,
      started: start <= now,
      canManage: r.organizer_id === viewer.userId || viewer.canModerate,
      visibility: r.visibility as EventVisibility,
      markerId: r.marker_id as string | null,
      projectId: r.project_id as string | null,
      sequence: r.calendar_sequence as number,
      updatedAt: (r.calendar_updated_at ?? r.created_at) as string,
      reserved: signup?.reserved ?? 0,
      waiting: signup?.waiting ?? false,
      offeredUntil: signup?.offered_until ?? null,
    };
  });
}

export function calendarEnabled() {
  return isEnabled("ff_p1b_social") && isEnabled("ff_community_events");
}

function eventQuery(
  viewer: Viewer,
  filters: {
    from?: Date;
    to?: Date;
    id?: string;
    joined?: boolean;
  } = {},
  staff = viewer.canModerate,
) {
  return db().rpc("read_events", {
    p_user: viewer.userId,
    p_staff: staff,
    p_from: filters.from?.toISOString() ?? null,
    p_to: filters.to?.toISOString() ?? null,
    p_id: filters.id ?? null,
    p_joined: filters.joined ?? false,
  });
}

export async function getEvent(
  viewer: Viewer,
  id: string,
  staff = viewer.canModerate,
) {
  if (!EVENT_ID.test(id)) return null;
  const { data, error } = await eventQuery(viewer, { id }, staff).maybeSingle();
  if (error) throw new Error(`event lookup: ${error.message}`);
  return data ? (await hydrate([data as Row], viewer))[0] : null;
}

export async function listJoinedEvents(userId: string, limit = 250) {
  const viewer: Viewer = {
    userId,
    cls: "user",
    canPublish: false,
    canModerate: false,
  };
  const { data, error } = await eventQuery(viewer, {
    // Keep recent cancellations in the subscription for calendar clients to reconcile.
    from: new Date(Date.now() - 30 * 86_400_000),
    joined: true,
  }).limit(limit);
  if (error) throw new Error(`my events: ${error.message}`);
  return hydrate(data ?? [], viewer);
}

/** Events that start inside [from, to), soonest first. */
export async function listEventsBetween(viewer: Viewer, from: Date, to: Date) {
  const { data, error } = await eventQuery(viewer, { from, to }).limit(200);
  if (error) throw new Error(`events: ${error.message}`);
  return hydrate(data ?? [], viewer);
}

/** Upcoming (and currently running) events for the chronological list. */
export async function listUpcoming(viewer: Viewer, limit = 50) {
  const { data, error } = await eventQuery(viewer, {
    from: new Date(Date.now() - 86_400_000),
  }).limit(limit + 20);
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
  await changeEventSignup(viewer, eventId, "join");
}

export async function leaveEvent(viewer: Viewer, eventId: string) {
  await changeEventSignup(viewer, eventId, "leave");
}

export async function inviteEventPlayer(
  viewer: Viewer,
  eventId: string,
  nick: string,
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("event_forbidden");
  if (!EVENT_ID.test(eventId) || !/^[A-Za-z0-9_]{3,16}$/.test(nick))
    throw new SocialError("event_invite_unavailable");
  const { error } = await db().rpc("invite_calendar_player", {
    p_user: viewer.userId,
    p_event: eventId,
    p_nick: nick,
  });
  await mapRpc(error);
}

export async function changeEventSignup(
  viewer: Viewer,
  eventId: string,
  action: "join" | "leave" | "waitlist" | "confirm" | "leave_waitlist",
) {
  if (
    !viewer.userId ||
    (!viewer.canPublish && action !== "leave" && action !== "leave_waitlist")
  )
    throw new SocialError("event_forbidden");
  if (!EVENT_ID.test(eventId)) throw new SocialError("event_not_found");
  const { error } = await db().rpc("event_signup", {
    p_user: viewer.userId,
    p_event: eventId,
    p_action: action,
    p_staff: viewer.canModerate,
    p_hold_seconds: seatHoldSeconds(),
  });
  await mapRpc(error);
}

async function manageable(viewer: Viewer, eventId: string) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("event_forbidden");
  if (!EVENT_ID.test(eventId)) throw new SocialError("event_not_found");
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
  const next = new Date(start).toISOString();
  if (Date.parse(old) === start) return;
  const { data, error } = await db()
    .from("events")
    .update({ starts_at: next, rescheduled_from: old })
    .eq("id", eventId)
    .eq("starts_at", old)
    .is("cancelled_at", null)
    .select("id");
  if (error) throw new Error(`event update: ${error.message}`);
  if (!data.length) throw new SocialError("event_changed");
  await writeAudit(
    viewer.userId!,
    own ? "event.rescheduled" : "event.rescheduled_by_moderator",
    { event_id: eventId, from: old, to: next },
  );
}

export async function cancelEvent(
  viewer: Viewer,
  eventId: string,
  reason: string,
) {
  const { own } = await manageable(viewer, eventId);
  const text = reason.trim().slice(0, 500);
  if (!own && text.length < 3) throw new SocialError("reason_too_short");
  const { data, error } = await db()
    .from("events")
    .update({
      cancelled_at: new Date().toISOString(),
      cancel_reason: text || null,
    })
    .eq("id", eventId)
    .is("cancelled_at", null)
    .select("id");
  if (error) throw new Error(`event cancellation: ${error.message}`);
  if (!data.length) throw new SocialError("event_changed");
  await writeAudit(
    viewer.userId!,
    own ? "event.cancelled" : "event.cancelled_by_moderator",
    { event_id: eventId, reason: text || null },
  );
}
