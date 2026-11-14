import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/supabase-admin";
import { decryptSecret, encryptSecret } from "./crypto";

function fail(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export async function createBridgeServer(name: string) {
  const { data, error } = await db()
    .from("bridge_servers")
    .insert({ name })
    .select("id")
    .single();
  fail(error, "bridge_servers insert");
  return data!.id as string;
}

/** Issues an HMAC key for a slot. The secret is returned once; only its ciphertext is stored. */
export async function issueBridgeKey(serverId: string, slot: "A" | "B") {
  const keyId = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const { error } = await db()
    .from("bridge_keys")
    .insert({
      key_id: keyId,
      server_id: serverId,
      slot,
      secret_enc: encryptSecret(secret),
    });
  fail(error, "bridge_keys insert");
  return { keyId, secret };
}

/** Revokes a key (rotation or compromise). Requests signed with it get ERR_KEY_REVOKED. */
export async function revokeBridgeKey(keyId: string) {
  const { error } = await db()
    .from("bridge_keys")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("key_id", keyId);
  fail(error, "bridge_keys revoke");
}

export async function loadBridgeKey(keyId: string) {
  const { data, error } = await db()
    .from("bridge_keys")
    .select("key_id, server_id, status, secret_enc")
    .eq("key_id", keyId)
    .maybeSingle();
  fail(error, "bridge_keys select");
  if (!data) return null;
  return {
    keyId: data.key_id as string,
    serverId: data.server_id as string,
    revoked: data.status === "revoked",
    secret: decryptSecret(data.secret_enc as string),
  };
}
