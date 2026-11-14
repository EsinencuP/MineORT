import "server-only";
import {
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";

export { encryptSecret, decryptSecret } from "@/lib/secrets";

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
