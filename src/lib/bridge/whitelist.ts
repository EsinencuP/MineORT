import "server-only";
import { db } from "@/lib/supabase-admin";
import { enqueueAction } from "./queue";

function fail(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const OPEN = ["queued", "leased", "failed_retryable"];

async function hasOpenAction(serverId: string, type: string, nickname: string) {
  const { data, error } = await db()
    .from("server_actions")
    .select("args")
    .eq("server_id", serverId)
    .eq("type", type)
    .in("status", OPEN);
  fail(error, "server_actions select");
  const lower = nickname.toLowerCase();
  return (data ?? []).some(
    (r) =>
      String((r.args as { nickname?: string }).nickname ?? "").toLowerCase() ===
      lower,
  );
}

/** True when somebody other than `userId` holds the nickname (active identity or desired-on entry). */
async function heldByAnotherUser(userId: string, nickname: string) {
  const lower = nickname.toLowerCase();
  const [{ data: ids }, { data: wl }] = await Promise.all([
    db()
      .from("minecraft_identities")
      .select("user_id, nickname")
      .neq("user_id", userId)
      .in("binding_status", ["reserved", "confirmed"]),
    db()
      .from("whitelist_entries")
      .select("user_id, nickname")
      .neq("user_id", userId)
      .eq("desired", "on"),
  ]);
  return [...(ids ?? []), ...(wl ?? [])].some(
    (r) => String(r.nickname).toLowerCase() === lower,
  );
}

async function allServers() {
  const { data, error } = await db().from("bridge_servers").select("id");
  fail(error, "bridge_servers select");
  return (data ?? []).map((s) => s.id as string);
}

/**
 * Approval pipeline (US-E04-05): desired=on entry plus a whitelist.add per server.
 * Idempotent; "access ready" is shown only once applied_state becomes 'applied'.
 * whitelist.add is issued only when the membership is approved, the account is active and the
 * nickname is not released (invariant I-02).
 */
export async function onMembershipApproved(userId: string) {
  const [{ data: user }, { data: membership }, { data: identity }] =
    await Promise.all([
      db().from("users").select("account_status").eq("id", userId).single(),
      db()
        .from("access_memberships")
        .select("status")
        .eq("user_id", userId)
        .eq("status", "approved")
        .maybeSingle(),
      db()
        .from("minecraft_identities")
        .select("nickname")
        .eq("user_id", userId)
        .in("binding_status", ["reserved", "confirmed"])
        .maybeSingle(),
    ]);
  if (!user || user.account_status !== "active" || !membership || !identity)
    return { queued: 0 };

  const nickname = identity.nickname as string;
  const { data: existing } = await db()
    .from("whitelist_entries")
    .select("nickname")
    .eq("user_id", userId)
    .maybeSingle();
  let stale =
    existing && existing.nickname.toLowerCase() !== nickname.toLowerCase()
      ? (existing.nickname as string)
      : null;
  // Never take a nickname off the server if it now belongs to somebody else.
  if (stale && (await heldByAnotherUser(userId, stale))) stale = null;

  const { error } = await db().from("whitelist_entries").upsert(
    {
      user_id: userId,
      nickname,
      desired: "on",
      applied_state: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  fail(error, "whitelist_entries upsert");

  let queued = 0;
  for (const serverId of await allServers()) {
    // The entry used to point at another nickname: take that one off the server first.
    if (stale && !(await hasOpenAction(serverId, "whitelist.remove", stale))) {
      await enqueueAction({
        serverId,
        userId,
        type: "whitelist.remove",
        args: { nickname: stale },
      });
    }
    if (await hasOpenAction(serverId, "whitelist.remove", nickname)) continue; // revocation wins
    if (await hasOpenAction(serverId, "whitelist.add", nickname)) continue;
    await enqueueAction({
      serverId,
      userId,
      type: "whitelist.add",
      args: { nickname },
    });
    queued++;
  }
  return { queued };
}

/** Honest status for the dashboard: ready only when the server confirmed it. */
export async function getWhitelistState(userId: string) {
  const { data, error } = await db()
    .from("whitelist_entries")
    .select("desired, applied_state, applied_at")
    .eq("user_id", userId)
    .maybeSingle();
  fail(error, "whitelist_entries select");
  return data as {
    desired: string;
    applied_state: string;
    applied_at: string | null;
  } | null;
}

/**
 * Reconciliation (protocol section 5). Snapshot = what the server really has.
 *  A desired on, missing   -> queue whitelist.add (state drift if it had been applied)
 *  B desired on, present   -> applied
 *  C1 desired off, present -> queue whitelist.remove (finishing our own decision)
 *  C2 unknown in snapshot  -> record drift for an admin; never delete automatically
 */
export async function reconcile(
  serverId: string,
  entries: { nickname: string; uuid?: string | null }[],
) {
  const snap = new Map(entries.map((e) => [e.nickname.toLowerCase(), e]));
  const { data: rows, error } = await db()
    .from("whitelist_entries")
    .select("user_id, nickname, desired, applied_state");
  fail(error, "whitelist_entries select");

  let added = 0;
  let drift = 0;
  let queued = 0;
  const known = new Set<string>();

  for (const r of rows ?? []) {
    const nick = r.nickname as string;
    known.add(nick.toLowerCase());
    const present = snap.has(nick.toLowerCase());
    if (r.desired === "on") {
      if (present) {
        if (r.applied_state !== "applied") {
          await db()
            .from("whitelist_entries")
            .update({
              applied_state: "applied",
              applied_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", r.user_id);
        }
      } else {
        if (r.applied_state === "applied") {
          await db()
            .from("whitelist_entries")
            .update({
              applied_state: "drift",
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", r.user_id);
          drift++;
        }
        if (!(await hasOpenAction(serverId, "whitelist.add", nick))) {
          await enqueueAction({
            serverId,
            userId: r.user_id,
            type: "whitelist.add",
            args: { nickname: nick },
          });
          queued++;
        }
      }
    } else if (present) {
      if (!(await hasOpenAction(serverId, "whitelist.remove", nick))) {
        await enqueueAction({
          serverId,
          userId: r.user_id,
          type: "whitelist.remove",
          args: { nickname: nick },
        });
        queued++;
      }
      await db()
        .from("whitelist_entries")
        .update({
          applied_state: "drift",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", r.user_id);
      drift++;
    }
  }

  for (const [lower, e] of snap) {
    if (known.has(lower)) continue;
    const { error: dErr } = await db()
      .from("whitelist_drift")
      .insert({
        server_id: serverId,
        nickname: e.nickname,
        mc_uuid: e.uuid ?? null,
      });
    if (dErr && dErr.code !== "23505") fail(dErr, "whitelist_drift insert"); // 23505: already open
    added++;
  }

  await db()
    .from("bridge_servers")
    .update({ last_reconcile_at: new Date().toISOString() })
    .eq("id", serverId);
  return { drift_unknown: added, drift, queued };
}

/** Takes a player off every server: whitelist.remove plus player.kick (revocation never gives up). */
export async function enqueueRevocation(userId: string, nickname: string) {
  for (const serverId of await allServers()) {
    if (!(await hasOpenAction(serverId, "whitelist.remove", nickname))) {
      await enqueueAction({
        serverId,
        userId,
        type: "whitelist.remove",
        args: { nickname },
      });
    }
    await enqueueAction({
      serverId,
      userId,
      type: "player.kick",
      args: { nickname, reason: "access_revoked" },
    });
  }
}

/**
 * Restoring access: revocations that have not started yet (queued or waiting for retry) are
 * cancelled, so they cannot undo the restoration. One already in flight (leased) finishes first and
 * the new whitelist.add follows (one whitelist action per nickname, oldest first).
 */
export async function cancelPendingRevocations(userId: string) {
  const { error } = await db()
    .from("server_actions")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("type", ["whitelist.remove", "player.kick"])
    .in("status", ["queued", "failed_retryable"]);
  fail(error, "server_actions cancel");
}
