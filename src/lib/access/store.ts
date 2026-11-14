import "server-only";
import { db } from "@/lib/supabase-admin";
import { randomToken, sha256Hex } from "@/lib/auth/crypto";

/** Stable error codes raised by the database functions (see migration 5). */
export const ACCESS_ERRORS = [
  "forbidden",
  "account_not_active",
  "rules_required",
  "rules_version_outdated",
  "version_not_newer",
  "nick_invalid_format",
  "nick_taken",
  "nick_quarantined",
  "nick_locked",
  "nick_required",
  "invitation_invalid",
  "invitation_revoked",
  "invitation_expired",
  "invitation_exhausted",
  "invitation_not_active",
  "already_member",
  "application_pending",
  "retry_too_soon",
  "no_pending_application",
  "reason_required",
  "bad_decision",
  "application_not_found",
  "already_decided",
  "bad_action",
  "cannot_target_self",
  "user_not_found",
  "user_deleted",
  "bad_transition",
  "delete_forbidden_banned",
] as const;
export type AccessErrorCode = (typeof ACCESS_ERRORS)[number];

export class AccessError extends Error {
  constructor(public readonly code: AccessErrorCode | "unknown") {
    super(code);
  }
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    const code = (ACCESS_ERRORS as readonly string[]).includes(error.message)
      ? (error.message as AccessErrorCode)
      : "unknown";
    if (code === "unknown") throw new Error(`${name}: ${error.message}`);
    throw new AccessError(code);
  }
  return data as T;
}

// ---- rules ----
export async function currentRules() {
  const { data, error } = await db()
    .from("rules_versions")
    .select("id, version_major, version_minor, body, published_at")
    .order("version_major", { ascending: false })
    .order("version_minor", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`rules select: ${error.message}`);
  return data;
}

export const publishRules = (
  actorId: string,
  major: number,
  minor: number,
  body: string,
) =>
  rpc<string>("publish_rules_version", {
    p_actor: actorId,
    p_major: major,
    p_minor: minor,
    p_body: body,
  });

export const acceptRules = (userId: string, versionId: string) =>
  rpc<null>("accept_rules", { p_user: userId, p_version: versionId });

export const hasAcceptedCurrentRules = (userId: string) =>
  rpc<boolean>("rules_accepted", { p_user: userId });

// ---- nickname ----
export const reserveNickname = (userId: string, nick: string) =>
  rpc<string>("reserve_nickname", { p_user: userId, p_nick: nick });

// ---- invitations ----
/** Creates an invitation; the 128-bit token is returned once and only its hash is stored. */
export async function createInvitation(actorId: string, maxUses = 1) {
  const token = randomToken(16); // 128 bits
  const id = await rpc<string>("create_invitation", {
    p_actor: actorId,
    p_token_hash: sha256Hex(token),
    p_max_uses: maxUses,
  });
  return { id, token };
}

export const revokeInvitation = (actorId: string, invitationId: string) =>
  rpc<null>("revoke_invitation", {
    p_actor: actorId,
    p_invitation: invitationId,
  });

export const redeemInvitation = (userId: string, token: string) =>
  rpc<string>("redeem_invitation", {
    p_user: userId,
    p_token_hash: sha256Hex(token),
  });

// ---- applications ----
export const submitApplication = (userId: string, text: string | null) =>
  rpc<string>("submit_application", { p_user: userId, p_text: text });

export const withdrawApplication = (userId: string) =>
  rpc<null>("withdraw_application", { p_user: userId });

export const decideApplication = (
  actorId: string,
  applicationId: string,
  decision: "approve" | "reject",
  reason: string | null,
) =>
  rpc<null>("decide_application", {
    p_actor: actorId,
    p_application: applicationId,
    p_decision: decision,
    p_reason: reason,
  });

// ---- read models for screens ----
export async function getAccessOverview(userId: string) {
  const [rules, accepted, identity, membership, application] =
    await Promise.all([
      currentRules(),
      hasAcceptedCurrentRules(userId),
      db()
        .from("minecraft_identities")
        .select("id, nickname, binding_status")
        .eq("user_id", userId)
        .in("binding_status", ["reserved", "confirmed"])
        .maybeSingle(),
      db()
        .from("access_memberships")
        .select("status")
        .eq("user_id", userId)
        .in("status", ["pending", "approved", "suspended"])
        .maybeSingle(),
      db()
        .from("applications")
        .select("id, status, decision_reason, decided_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  return {
    rules,
    rulesAccepted: accepted,
    identity: identity.data,
    membership: membership.data,
    application: application.data,
  };
}

export async function listPendingApplications() {
  const { data, error } = await db()
    .from("applications")
    .select(
      "id, text, created_at, user_id, minecraft_identities(nickname), users!applications_user_id_fkey(display_name)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`applications select: ${error.message}`);
  return data ?? [];
}

export async function listInvitations() {
  const { data, error } = await db()
    .from("invitations")
    .select("id, status, max_uses, used_count, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`invitations select: ${error.message}`);
  return data ?? [];
}

export async function listAudit(limit = 100) {
  const { data, error } = await db()
    .from("audit_log")
    .select("id, action, details, at, actor_id, users:actor_id(display_name)")
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit select: ${error.message}`);
  return data ?? [];
}

export async function getTelegramBinding(userId: string) {
  const { data, error } = await db()
    .from("telegram_identities")
    .select("username, linked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`telegram_identities select: ${error.message}`);
  return data as { username: string | null; linked_at: string } | null;
}
