import "server-only";
import {
  AccessError,
  ACCESS_ERRORS,
  type AccessErrorCode,
} from "@/lib/access/store";
import {
  cancelPendingRevocations,
  enqueueRevocation,
  getWhitelistState,
  onMembershipApproved,
} from "@/lib/bridge/whitelist";
import { telegramIdHash } from "@/lib/secrets";
import { db } from "@/lib/supabase-admin";

function fail(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Free text for ILIKE: filter syntax is dropped, LIKE wildcards are escaped ("_" is legal in nicknames). */
export function likeTerm(text: string): string {
  return text
    .replace(/[,()"'`;:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[\\%_]/g, (m) => "\\" + m);
}

/** The state change is saved already; a queue failure is logged and reconciliation finishes the job. */
function logQueueFailure(error: unknown) {
  console.error(
    "[bridge queue] follow-up failed:",
    error instanceof Error ? error.message : error,
  );
}

export type PlayerRow = {
  id: string;
  display_name: string | null;
  account_status: string;
  site_role: string;
  created_at: string;
  telegram_username: string | null;
  nickname: string | null;
};

/** Search by nickname, Telegram username or display name. Empty query lists the newest players. */
export async function searchPlayers(query: string): Promise<PlayerRow[]> {
  const q = likeTerm(query);
  let ids: string[] | null = null;
  if (q) {
    const [a, b, c] = await Promise.all([
      db()
        .from("minecraft_identities")
        .select("user_id")
        .ilike("nickname", `%${q}%`)
        .limit(50),
      db()
        .from("telegram_identities")
        .select("user_id")
        .ilike("username", `%${q}%`)
        .limit(50),
      db().from("users").select("id").ilike("display_name", `%${q}%`).limit(50),
    ]);
    ids = [
      ...new Set([
        ...(a.data ?? []).map((r) => r.user_id),
        ...(b.data ?? []).map((r) => r.user_id),
        ...(c.data ?? []).map((r) => r.id),
      ]),
    ];
    if (ids.length === 0) return [];
  }
  let users = db()
    .from("users")
    .select("id, display_name, account_status, site_role, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (ids) users = users.in("id", ids);
  const { data, error } = await users;
  fail(error, "users select");
  const list = data ?? [];
  const userIds = list.map((u) => u.id as string);
  const [tg, mc] = await Promise.all([
    db()
      .from("telegram_identities")
      .select("user_id, username")
      .in("user_id", userIds),
    db()
      .from("minecraft_identities")
      .select("user_id, nickname, binding_status")
      .in("user_id", userIds)
      .in("binding_status", ["reserved", "confirmed"]),
  ]);
  const tgBy = new Map(
    (tg.data ?? []).map((r) => [
      r.user_id as string,
      r.username as string | null,
    ]),
  );
  const mcBy = new Map(
    (mc.data ?? []).map((r) => [r.user_id as string, r.nickname as string]),
  );
  return list.map((u) => ({
    ...(u as Omit<PlayerRow, "telegram_username" | "nickname">),
    telegram_username: tgBy.get(u.id as string) ?? null,
    nickname: mcBy.get(u.id as string) ?? null,
  }));
}

export async function getPlayer(id: string) {
  const [user, tg, ident, membership, app, wl] = await Promise.all([
    db()
      .from("users")
      .select(
        "id, display_name, account_status, site_role, banned_until, restriction_reason, created_at, deleted_at",
      )
      .eq("id", id)
      .maybeSingle(),
    db()
      .from("telegram_identities")
      .select("telegram_id, username, linked_at")
      .eq("user_id", id)
      .maybeSingle(),
    db()
      .from("minecraft_identities")
      .select("nickname, binding_status, quarantine_until")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(3),
    db()
      .from("access_memberships")
      .select("status, revoke_reason, decided_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("applications")
      .select("status, decision_reason, decided_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getWhitelistState(id),
  ]);
  if (!user.data) return null;
  return {
    user: user.data,
    telegram: tg.data,
    identities: ident.data ?? [],
    membership: membership.data,
    application: app.data,
    whitelist: wl,
  };
}

async function telegramHashFor(userId: string): Promise<string | null> {
  const { data } = await db()
    .from("telegram_identities")
    .select("telegram_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? telegramIdHash(String(data.telegram_id)) : null;
}

async function rpcJson<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    if ((ACCESS_ERRORS as readonly string[]).includes(error.message))
      throw new AccessError(error.message as AccessErrorCode);
    throw new Error(`${name}: ${error.message}`);
  }
  return data as T;
}

/** suspend | ban | unban. The database does the state change atomically; the game side follows. */
export async function setAccountStatus(
  actorId: string,
  targetId: string,
  action: "suspend" | "ban" | "unban",
  reason: string | null,
  until: Date | null,
) {
  const hash = await telegramHashFor(targetId);
  const out = await rpcJson<{ nickname: string | null; restored: boolean }>(
    "admin_set_account_status",
    {
      p_actor: actorId,
      p_user: targetId,
      p_action: action,
      p_reason: reason,
      p_until: until?.toISOString() ?? null,
      p_tg_hash: hash,
    },
  );
  // The decision is saved already; if the queue is unreachable, reconciliation finishes the job.
  if (action !== "unban" && out.nickname)
    await enqueueRevocation(targetId, out.nickname).catch(logQueueFailure);
  if (action === "unban" && out.restored) {
    // Revocations that have not started must not undo the restoration.
    await cancelPendingRevocations(targetId).catch(logQueueFailure);
    await onMembershipApproved(targetId).catch(logQueueFailure);
  }
  return out;
}

/** Deletes an account (self-service or by an admin). Banned users cannot delete themselves. */
export async function deleteAccount(actorId: string, targetId: string) {
  const hash = await telegramHashFor(targetId);
  const out = await rpcJson<{ nickname: string | null; already: boolean }>(
    "delete_account",
    {
      p_user: targetId,
      p_actor: actorId,
      p_tg_hash: hash,
    },
  );
  if (out.nickname)
    await enqueueRevocation(targetId, out.nickname).catch(logQueueFailure);
  return out;
}
