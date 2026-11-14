import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/supabase-admin";
import { canonicalize } from "./jcs";
import { signCanonical, sigKid } from "./crypto";

function fail(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/** Whitelist of action types the backend may issue, with their lifetime (null = no expiry). */
export const ACTION_TTL_MS: Record<string, number | null> = {
  "whitelist.add": 24 * 3600_000,
  "whitelist.remove": null, // revocation never expires
  "player.kick": 10 * 60_000,
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** What the Bridge verifies: Ed25519 over this exact object, canonical JSON (JCS). */
export function buildActionPayload(p: {
  actionId: string;
  serverId: string;
  type: string;
  args: Record<string, unknown>;
  issuedAt: Date;
  expiresAt: Date | null;
}) {
  return {
    action_id: p.actionId,
    server_id: p.serverId,
    type: p.type,
    args: p.args,
    issued_at: iso(p.issuedAt),
    expires_at: p.expiresAt ? iso(p.expiresAt) : null,
  };
}

/** Creates a signed action. The exact signed bytes are stored and re-sent on every lease. */
export async function enqueueAction(p: {
  serverId: string;
  userId?: string | null;
  type: string;
  args: Record<string, unknown>;
  retryOf?: string;
}) {
  if (!(p.type in ACTION_TTL_MS))
    throw new Error(`action type not allowed: ${p.type}`);
  const id = randomUUID();
  const issuedAt = new Date();
  const ttl = ACTION_TTL_MS[p.type];
  const expiresAt = ttl === null ? null : new Date(issuedAt.getTime() + ttl);
  const payload = buildActionPayload({
    actionId: id,
    serverId: p.serverId,
    type: p.type,
    args: p.args,
    issuedAt,
    expiresAt,
  });
  const signedPayload = canonicalize(payload);
  const { error } = await db()
    .from("server_actions")
    .insert({
      id,
      server_id: p.serverId,
      user_id: p.userId ?? null,
      type: p.type,
      args: p.args,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      signed_payload: signedPayload,
      signature: signCanonical(signedPayload),
      sig_kid: sigKid(),
      retry_of: p.retryOf ?? null,
    });
  fail(error, "server_actions insert");
  return id;
}

type LeasedRow = {
  id: string;
  server_id: string;
  type: string;
  args: Record<string, unknown>;
  issued_at: string;
  expires_at: string | null;
  signed_payload: string;
  signature: string;
  sig_kid: string;
  attempt: number;
  lease_until: string;
};

export async function leaseActions(serverId: string, max: number) {
  const { data, error } = await db().rpc("lease_actions", {
    p_server: serverId,
    p_max: max,
  });
  fail(error, "lease_actions");
  return ((data ?? []) as LeasedRow[]).map((r) => ({
    action_id: r.id,
    server_id: r.server_id,
    type: r.type,
    args: r.args,
    issued_at: JSON.parse(r.signed_payload).issued_at as string, // exactly what was signed
    expires_at: JSON.parse(r.signed_payload).expires_at as string | null,
    signed_payload: r.signed_payload,
    signature: r.signature,
    sig_kid: r.sig_kid,
    attempt: r.attempt,
    lease_until: r.lease_until,
  }));
}

export async function recordResult(p: {
  serverId: string;
  actionId: string;
  attempt: number;
  status: string;
  retryable: boolean;
  errorCode: string | null;
  detail: string | null;
}): Promise<string> {
  const { data, error } = await db().rpc("record_action_result", {
    p_server: p.serverId,
    p_action: p.actionId,
    p_attempt: p.attempt,
    p_status: p.status,
    p_retryable: p.retryable,
    p_error: p.errorCode,
    p_detail: p.detail,
  });
  fail(error, "record_action_result");
  return data as string;
}
