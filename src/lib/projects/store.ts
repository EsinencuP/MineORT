import "server-only";
import { likeTerm } from "@/lib/admin/players";
import { writeAudit } from "@/lib/audit";
import { userIdByNick } from "@/lib/guilds/store";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "@/lib/social/errors";
import type { Viewer } from "@/lib/social/viewer";

export const PAGE_SIZE = 12;
export const MAX_NEEDS = 15;
const MAX_ACTIVE_PER_USER = 5;

export const STATUS_LABEL = {
  recruiting: "Нужна помощь",
  in_progress: "В работе",
  done: "Готово",
  cancelled: "Отменён",
} as const;
export type ProjectStatus = keyof typeof STATUS_LABEL;
export const DIMENSIONS = {
  overworld: "Верхний мир",
  nether: "Незер",
  end: "Энд",
} as const;
export type Dimension = keyof typeof DIMENSIONS;

export type Need = {
  id: string;
  title: string;
  quantityNeeded: number | null;
  quantityDone: number;
  unit: string;
  done: boolean;
  /** What supporters have promised for this need. */
  pledged: number;
};

export type ProjectCardData = {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  place: string;
  dimension: Dimension;
  x: number | null;
  y: number | null;
  z: number | null;
  coverMediaId: string | null;
  progress: number;
  openNeeds: number;
  supporters: number;
  authorId: string;
  authorName: string;
  createdAt: string;
};

export type Supporter = {
  nick: string;
  needTitle: string | null;
  quantity: number | null;
  note: string;
  mine: boolean;
};

export type ProjectDetail = ProjectCardData & {
  needs: Need[];
  supporterList: Supporter[] | null; // null for guests
  maxSupporters: number | null;
  cancelReason: string | null;
  isAuthor: boolean;
  canManage: boolean;
  mySupport: {
    needId: string | null;
    quantity: number | null;
    note: string;
  } | null;
};

export type NewNeed = { title: string; quantity: number | null; unit: string };
export type NewProject = {
  title: string;
  description: string;
  place: string;
  dimension: string;
  x: number | null;
  y: number | null;
  z: number | null;
  coverMediaId: string | null;
  maxSupporters: number | null;
  needs: NewNeed[];
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

/** Share of the work done: counted needs weigh their quantity, yes/no needs weigh 1. */
export function progressOf(
  needs: {
    quantityNeeded: number | null;
    quantityDone: number;
    done: boolean;
  }[],
): number {
  let total = 0;
  let achieved = 0;
  for (const n of needs) {
    if (n.quantityNeeded) {
      total += n.quantityNeeded;
      achieved += n.done
        ? n.quantityNeeded
        : Math.min(n.quantityDone, n.quantityNeeded);
    } else {
      total += 1;
      achieved += n.done ? 1 : 0;
    }
  }
  return total === 0 ? 0 : Math.round((achieved / total) * 100);
}

async function names(ids: string[]) {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const [{ data: users }, { data: nicks }] = await Promise.all([
    db().from("users").select("id, display_name").in("id", ids),
    db()
      .from("minecraft_identities")
      .select("user_id, nickname")
      .in("user_id", ids)
      .in("binding_status", ["reserved", "confirmed"]),
  ]);
  const nickOf = new Map(
    (nicks ?? []).map((n) => [n.user_id, n.nickname as string]),
  );
  for (const u of users ?? [])
    map.set(
      u.id as string,
      nickOf.get(u.id) ?? (u.display_name as string | null) ?? "Игрок",
    );
  return map;
}

type Row = Record<string, unknown>;

function toNeed(r: Row, pledged: Map<string, number>): Need {
  return {
    id: r.id as string,
    title: r.title as string,
    quantityNeeded: (r.quantity_needed as number | null) ?? null,
    quantityDone: r.quantity_done as number,
    unit: r.unit as string,
    done: r.done as boolean,
    pledged: pledged.get(r.id as string) ?? 0,
  };
}

async function hydrate(rows: Row[]): Promise<ProjectCardData[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const [{ data: needs }, { data: sup }, authors] = await Promise.all([
    db()
      .from("project_needs")
      .select("*")
      .in("project_id", ids)
      .order("position"),
    db().from("project_supporters").select("project_id").in("project_id", ids),
    names([...new Set(rows.map((r) => r.author_id as string))]),
  ]);
  return rows.map((r) => {
    const mine = (needs ?? [])
      .filter((n) => n.project_id === r.id)
      .map((n) => toNeed(n, new Map()));
    const open = mine.filter(
      (n) =>
        !n.done &&
        (n.quantityNeeded === null || n.quantityDone < n.quantityNeeded),
    );
    return {
      id: r.id as string,
      title: r.title as string,
      description: r.description as string,
      status: r.status as ProjectStatus,
      place: r.place as string,
      dimension: r.dimension as Dimension,
      x: (r.x as number | null) ?? null,
      y: (r.y as number | null) ?? null,
      z: (r.z as number | null) ?? null,
      coverMediaId: (r.cover_media_id as string | null) ?? null,
      progress: r.status === "done" ? 100 : progressOf(mine),
      openNeeds: open.length,
      supporters: (sup ?? []).filter((s) => s.project_id === r.id).length,
      authorId: r.author_id as string,
      authorName: authors.get(r.author_id as string) ?? "Игрок",
      createdAt: r.created_at as string,
    };
  });
}

/* ---------------- create ---------------- */
function cleanNeeds(needs: NewNeed[]) {
  const list = needs
    .map((n) => ({
      title: n.title.trim(),
      quantity: n.quantity && n.quantity > 0 ? Math.trunc(n.quantity) : null,
      unit: n.unit.trim().slice(0, 20),
    }))
    .filter((n) => n.title.length > 0);
  if (list.some((n) => n.title.length > 80 || (n.quantity ?? 1) > 100000))
    throw new SocialError("project_invalid");
  if (list.length > MAX_NEEDS) throw new SocialError("project_needs_limit");
  return list;
}

function cleanCoords(i: {
  x: number | null;
  y: number | null;
  z: number | null;
}) {
  const ok = (v: number | null, min: number, max: number) =>
    v === null || (Number.isInteger(v) && v >= min && v <= max);
  if (
    !ok(i.x, -30_000_000, 30_000_000) ||
    !ok(i.z, -30_000_000, 30_000_000) ||
    !ok(i.y, -64, 320)
  )
    throw new SocialError("project_invalid");
  if ((i.x === null) !== (i.z === null))
    throw new SocialError("project_invalid");
  return i;
}

async function checkCover(viewer: Viewer, mediaId: string | null) {
  if (!mediaId) return null;
  const { data } = await db()
    .from("media")
    .select("id")
    .eq("id", mediaId)
    .eq("uploader_id", viewer.userId!)
    .eq("visibility", "public")
    .eq("moderation_status", "approved")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new SocialError("project_cover_invalid");
  return mediaId;
}

export async function createProject(viewer: Viewer, input: NewProject) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("project_forbidden");
  const title = input.title.trim();
  if (
    title.length < 3 ||
    title.length > 120 ||
    input.description.length > 2000 ||
    input.place.length > 120
  )
    throw new SocialError("project_invalid");
  const coords = cleanCoords(input);
  const needs = cleanNeeds(input.needs);
  const dimension: Dimension =
    input.dimension in DIMENSIONS
      ? (input.dimension as Dimension)
      : "overworld";
  const max =
    input.maxSupporters &&
    input.maxSupporters >= 1 &&
    input.maxSupporters <= 500
      ? Math.trunc(input.maxSupporters)
      : null;
  if (!(await within(`project:${viewer.userId}`, 86_400, 5)))
    throw new SocialError("project_rate_limited");
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("author_id", viewer.userId)
    .in("status", ["recruiting", "in_progress"]);
  if ((count ?? 0) >= MAX_ACTIVE_PER_USER)
    throw new SocialError("project_limit");
  const cover = await checkCover(viewer, input.coverMediaId);

  const { data: project, error } = await db()
    .from("projects")
    .insert({
      author_id: viewer.userId,
      title,
      description: input.description.trim(),
      place: input.place.trim(),
      dimension,
      x: coords.x,
      y: coords.y,
      z: coords.z,
      cover_media_id: cover,
      max_supporters: max,
    })
    .select("id")
    .single();
  if (error || !project) throw new Error(`project insert: ${error?.message}`);
  if (needs.length > 0) {
    const { error: needErr } = await db()
      .from("project_needs")
      .insert(
        needs.map((n, position) => ({
          project_id: project.id,
          title: n.title,
          quantity_needed: n.quantity,
          unit: n.unit,
          position,
        })),
      );
    if (needErr) {
      await db().from("projects").delete().eq("id", project.id);
      throw new Error(`project needs: ${needErr.message}`);
    }
  }
  return project.id as string;
}

/* ---------------- read ---------------- */
export type ProjectFilter = {
  status?: string;
  q?: string;
  mine?: boolean;
  page?: number;
};

export async function listProjects(viewer: Viewer, f: ProjectFilter = {}) {
  let q = db().from("projects").select("*");
  if (f.mine && viewer.userId) {
    const { data: sup } = await db()
      .from("project_supporters")
      .select("project_id")
      .eq("user_id", viewer.userId);
    const ids = (sup ?? []).map((s) => s.project_id as string);
    q = ids.length
      ? q.or(`author_id.eq.${viewer.userId},id.in.(${ids.join(",")})`)
      : q.eq("author_id", viewer.userId);
  } else {
    q = q.neq("status", "cancelled");
  }
  if (f.status && f.status in STATUS_LABEL && f.status !== "cancelled")
    q = q.eq("status", f.status);
  const term = likeTerm(f.q ?? "");
  if (term) q = q.ilike("title", `%${term}%`);
  const page = Math.max(0, f.page ?? 0);
  const from = page * PAGE_SIZE;
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE);
  if (error) throw new Error(`projects: ${error.message}`);
  const rows = data ?? [];
  return {
    projects: await hydrate(rows.slice(0, PAGE_SIZE)),
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function getProject(
  viewer: Viewer,
  id: string,
): Promise<ProjectDetail | null> {
  const { data: row } = await db()
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  const isAuthor = row.author_id === viewer.userId;
  if (row.status === "cancelled" && !isAuthor && !viewer.canModerate)
    return null;
  const [{ data: needRows }, { data: supRows }] = await Promise.all([
    db()
      .from("project_needs")
      .select("*")
      .eq("project_id", id)
      .order("position"),
    db()
      .from("project_supporters")
      .select("*")
      .eq("project_id", id)
      .order("created_at"),
  ]);
  const pledged = new Map<string, number>();
  for (const s of supRows ?? [])
    if (s.need_id)
      pledged.set(
        s.need_id as string,
        (pledged.get(s.need_id as string) ?? 0) +
          ((s.quantity as number | null) ?? 0),
      );
  const needs = (needRows ?? []).map((n) => toNeed(n, pledged));
  const nick = await names((supRows ?? []).map((s) => s.user_id as string));
  const [card] = await hydrate([row]);
  const mine = (supRows ?? []).find((s) => s.user_id === viewer.userId);
  return {
    ...card,
    progress: row.status === "done" ? 100 : progressOf(needs),
    needs,
    supporterList:
      viewer.cls === "guest"
        ? null
        : (supRows ?? []).map((s) => ({
            nick: nick.get(s.user_id as string) ?? "Игрок",
            needTitle: needs.find((n) => n.id === s.need_id)?.title ?? null,
            quantity: (s.quantity as number | null) ?? null,
            note: s.note as string,
            mine: s.user_id === viewer.userId,
          })),
    maxSupporters: (row.max_supporters as number | null) ?? null,
    cancelReason: (row.cancel_reason as string | null) ?? null,
    isAuthor,
    canManage: isAuthor && row.status !== "cancelled",
    mySupport: mine
      ? {
          needId: (mine.need_id as string | null) ?? null,
          quantity: (mine.quantity as number | null) ?? null,
          note: mine.note as string,
        }
      : null,
  };
}

/** Projects the player owns or supports and that are still running, for the cabinet. */
export async function myActiveProjects(userId: string, limit = 4) {
  const { data: sup } = await db()
    .from("project_supporters")
    .select("project_id")
    .eq("user_id", userId);
  const ids = (sup ?? []).map((s) => s.project_id as string);
  const q = db()
    .from("projects")
    .select("*")
    .in("status", ["recruiting", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data } = await (ids.length
    ? q.or(`author_id.eq.${userId},id.in.(${ids.join(",")})`)
    : q.eq("author_id", userId));
  const cards = await hydrate(data ?? []);
  const needs = cards.length
    ? ((
        await db()
          .from("project_needs")
          .select(
            "project_id, title, quantity_needed, quantity_done, unit, done, position",
          )
          .in(
            "project_id",
            cards.map((c) => c.id),
          )
          .order("position")
      ).data ?? [])
    : [];
  return cards.map((c) => {
    const first = needs.find(
      (n) =>
        n.project_id === c.id &&
        !n.done &&
        (n.quantity_needed === null ||
          (n.quantity_done as number) < (n.quantity_needed as number)),
    );
    return {
      ...c,
      role: c.authorId === userId ? "Автор" : "Поддерживаю",
      next: first
        ? `${first.title}${first.quantity_needed ? `: ещё ${(first.quantity_needed as number) - (first.quantity_done as number)} ${first.unit}`.trimEnd() : ""}`
        : "Все потребности закрыты",
    };
  });
}

/* ---------------- manage (author) ---------------- */
async function ownProject(viewer: Viewer, id: string) {
  if (!viewer.userId) throw new SocialError("project_forbidden");
  const { data } = await db()
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new SocialError("project_not_found");
  if (data.author_id !== viewer.userId)
    throw new SocialError("project_not_found"); // no hint for strangers
  if (data.status === "cancelled") throw new SocialError("project_closed");
  return data as Row;
}

export async function updateProject(
  viewer: Viewer,
  id: string,
  patch: Partial<NewProject> & { status?: string },
) {
  const cur = await ownProject(viewer, id);
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length < 3 || t.length > 120)
      throw new SocialError("project_invalid");
    upd.title = t;
  }
  if (patch.description !== undefined) {
    if (patch.description.length > 2000)
      throw new SocialError("project_invalid");
    upd.description = patch.description.trim();
  }
  if (patch.place !== undefined) {
    if (patch.place.length > 120) throw new SocialError("project_invalid");
    upd.place = patch.place.trim();
  }
  if (patch.dimension !== undefined && patch.dimension in DIMENSIONS)
    upd.dimension = patch.dimension;
  if (patch.x !== undefined || patch.z !== undefined || patch.y !== undefined) {
    const c = cleanCoords({
      x: patch.x ?? null,
      y: patch.y ?? null,
      z: patch.z ?? null,
    });
    upd.x = c.x;
    upd.y = c.y;
    upd.z = c.z;
  }
  if (patch.coverMediaId !== undefined)
    upd.cover_media_id = await checkCover(viewer, patch.coverMediaId);
  if (patch.maxSupporters !== undefined)
    upd.max_supporters =
      patch.maxSupporters &&
      patch.maxSupporters >= 1 &&
      patch.maxSupporters <= 500
        ? Math.trunc(patch.maxSupporters)
        : null;
  if (patch.status !== undefined) {
    if (!["recruiting", "in_progress", "done"].includes(patch.status))
      throw new SocialError("project_invalid");
    upd.status = patch.status;
    upd.completed_at =
      patch.status === "done" ? new Date().toISOString() : null;
    if (patch.status !== "done" && cur.status === "done") {
      const { count } = await db()
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("author_id", viewer.userId!)
        .in("status", ["recruiting", "in_progress"]);
      if ((count ?? 0) >= MAX_ACTIVE_PER_USER)
        throw new SocialError("project_limit");
    }
  }
  const { error } = await db().from("projects").update(upd).eq("id", id);
  if (error?.code === "23514") throw new SocialError("project_invalid");
  if (error) throw new Error(`project update: ${error.message}`);
}

export async function addNeed(
  viewer: Viewer,
  projectId: string,
  need: NewNeed,
) {
  await ownProject(viewer, projectId);
  const [n] = cleanNeeds([need]);
  if (!n) throw new SocialError("project_invalid");
  const { count } = await db()
    .from("project_needs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((count ?? 0) >= MAX_NEEDS) throw new SocialError("project_needs_limit");
  const { error } = await db()
    .from("project_needs")
    .insert({
      project_id: projectId,
      title: n.title,
      quantity_needed: n.quantity,
      unit: n.unit,
      position: count ?? 0,
    });
  if (error) throw new Error(`need insert: ${error.message}`);
}

async function ownNeed(viewer: Viewer, needId: string) {
  const { data: need } = await db()
    .from("project_needs")
    .select("*")
    .eq("id", needId)
    .maybeSingle();
  if (!need) throw new SocialError("project_need_not_found");
  await ownProject(viewer, need.project_id as string);
  return need as Row;
}

/** Progress made by the author: how much is done, or a yes/no mark for needs without a quantity. */
export async function updateNeed(
  viewer: Viewer,
  needId: string,
  patch: { quantityDone?: number; done?: boolean },
) {
  const need = await ownNeed(viewer, needId);
  const upd: Record<string, unknown> = {};
  if (patch.quantityDone !== undefined) {
    if (
      !Number.isInteger(patch.quantityDone) ||
      patch.quantityDone < 0 ||
      patch.quantityDone > 100000
    )
      throw new SocialError("project_invalid");
    upd.quantity_done = patch.quantityDone;
    const needed = need.quantity_needed as number | null;
    if (needed) upd.done = patch.quantityDone >= needed;
  }
  if (patch.done !== undefined) {
    upd.done = patch.done;
    const needed = need.quantity_needed as number | null;
    if (needed && patch.done) upd.quantity_done = needed;
  }
  if (Object.keys(upd).length === 0) return;
  await db().from("project_needs").update(upd).eq("id", needId);
  await db()
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", need.project_id as string);
}

export async function removeNeed(viewer: Viewer, needId: string) {
  await ownNeed(viewer, needId);
  await db().from("project_needs").delete().eq("id", needId);
}

export async function removeSupporter(
  viewer: Viewer,
  projectId: string,
  nick: string,
) {
  await ownProject(viewer, projectId);
  const uid = await userIdByNick(nick);
  if (!uid) throw new SocialError("project_not_found");
  await db()
    .from("project_supporters")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", uid);
}

/* ---------------- support ---------------- */
export async function joinSupport(
  viewer: Viewer,
  projectId: string,
  i: { needId: string | null; quantity: number | null; note: string },
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("project_forbidden");
  const { data: p } = await db()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!p || p.status === "cancelled")
    throw new SocialError("project_not_found");
  if (p.status === "done") throw new SocialError("project_closed");
  if (p.author_id === viewer.userId) throw new SocialError("project_own");
  const note = i.note.trim().slice(0, 200);
  let needId: string | null = null;
  let quantity: number | null = null;
  if (i.needId) {
    const { data: need } = await db()
      .from("project_needs")
      .select("id, quantity_needed")
      .eq("id", i.needId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!need) throw new SocialError("project_need_not_found");
    needId = need.id as string;
    if (i.quantity !== null) {
      if (
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 100000
      )
        throw new SocialError("project_invalid");
      quantity = i.quantity;
    }
  }
  const { data: existing } = await db()
    .from("project_supporters")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", viewer.userId)
    .maybeSingle();
  if (!existing && p.max_supporters) {
    const { count } = await db()
      .from("project_supporters")
      .select("user_id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if ((count ?? 0) >= (p.max_supporters as number))
      throw new SocialError("project_full");
  }
  // one row per supporter: signing up again updates the pledge
  const { error } = await db().from("project_supporters").upsert(
    {
      project_id: projectId,
      user_id: viewer.userId,
      need_id: needId,
      quantity,
      note,
    },
    { onConflict: "project_id,user_id" },
  );
  if (error) throw new Error(`support upsert: ${error.message}`);
  return !existing;
}

export async function leaveSupport(viewer: Viewer, projectId: string) {
  if (!viewer.userId) throw new SocialError("project_forbidden");
  await db()
    .from("project_supporters")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", viewer.userId);
}

/** The author closes the project; a moderator may cancel any project with a reason (audited). */
export async function cancelProject(
  viewer: Viewer,
  projectId: string,
  reason: string,
) {
  if (!viewer.userId) throw new SocialError("project_forbidden");
  const { data: p } = await db()
    .from("projects")
    .select("id, author_id, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!p || p.status === "cancelled")
    throw new SocialError("project_not_found");
  const own = p.author_id === viewer.userId;
  if (!own && !viewer.canModerate) throw new SocialError("project_not_found");
  const text = reason.trim().slice(0, 300);
  if (!own && text.length < 3) throw new SocialError("reason_too_short");
  await db()
    .from("projects")
    .update({
      status: "cancelled",
      cancel_reason: text || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  await writeAudit(
    viewer.userId,
    own ? "project.cancelled" : "project.cancelled_by_moderator",
    {
      project_id: projectId,
      reason: text || null,
    },
  );
}

/** Covers shown on cards must be reachable by everybody: used by the media access check. */
export async function isCoverOfOpenProject(mediaId: string): Promise<boolean> {
  const { count } = await db()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("cover_media_id", mediaId)
    .neq("status", "cancelled");
  return (count ?? 0) > 0;
}
