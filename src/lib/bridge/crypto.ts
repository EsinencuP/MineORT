import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

// ---- envelope encryption of HMAC secrets (AES-256-GCM, key from the environment) ----
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

// ---- Ed25519 signing of commands and login decisions ----
export const sigKid = () => process.env.BRIDGE_SIG_KID ?? "k1";

function privateKey() {
  const raw = process.env.BRIDGE_ED25519_PRIVATE_KEY;
  if (!raw) throw new Error("BRIDGE_ED25519_PRIVATE_KEY is not set");
  return createPrivateKey({
    key: Buffer.from(raw, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

/** base64 signature over the UTF-8 bytes of the canonical JSON string. */
export function signCanonical(canonicalJson: string): string {
  return edSign(
    null,
    Buffer.from(canonicalJson, "utf8"),
    privateKey(),
  ).toString("base64");
}

/** Public key as base64 SPKI DER: this goes into the Bridge plugin config. */
export function publicKeyBase64(): string {
  return createPublicKey(privateKey())
    .export({ format: "der", type: "spki" })
    .toString("base64");
}

/** Reference verifier (what the Bridge does); used by tests and docs. */
export function verifyCanonical(
  canonicalJson: string,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  try {
    const pub = createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
    return edVerify(
      null,
      Buffer.from(canonicalJson, "utf8"),
      pub,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}
