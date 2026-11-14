import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

// Envelope encryption (AES-256-GCM) for secrets kept in the database. The key lives in the
// environment, never in the database. Intentionally free of "server-only" so test tooling can use it.
function kek(): Buffer {
  const raw = process.env.BRIDGE_KEK;
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) {
    throw new Error("BRIDGE_KEK must be 32 bytes, base64");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const d = createDecipheriv("aes-256-gcm", kek(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString(
    "utf8",
  );
}

/** HMAC of a Telegram ID for deletion tombstones: the ID itself is never stored. */
export function telegramIdHash(telegramId: string | number | bigint): string {
  const key = process.env.TOMBSTONE_HMAC_KEY;
  if (!key || key.length < 32)
    throw new Error("TOMBSTONE_HMAC_KEY must be set (32+ chars)");
  return createHmac("sha256", key)
    .update(String(telegramId), "utf8")
    .digest("hex");
}
