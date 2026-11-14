import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  codeAt,
  generateSecret,
  hotp,
  otpauthUri,
  verifyTotp,
} from "./totp";

// RFC 6238 appendix B: secret "12345678901234567890", SHA-1, 8 digits.
const rfcSecret = Buffer.from("12345678901234567890");

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(hotp(rfcSecret, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(hotp(rfcSecret, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(hotp(rfcSecret, Math.floor(20000000000 / 30), 8)).toBe("65353130");
  });

  it("base32 round-trips and matches the RFC 4648 example", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("accepts the current step and one step of drift, nothing further", () => {
    const secret = generateSecret();
    const now = Date.UTC(2026, 11, 1, 12, 0, 15);
    const at = (offsetSteps: number) =>
      codeAt(secret, now + offsetSteps * 30_000);
    expect(verifyTotp(secret, at(0), now, 0).ok).toBe(true);
    expect(verifyTotp(secret, at(-1), now, 0).ok).toBe(true);
    expect(verifyTotp(secret, at(1), now, 0).ok).toBe(true);
    expect(verifyTotp(secret, at(-2), now, 0).ok).toBe(false);
    expect(verifyTotp(secret, at(2), now, 0).ok).toBe(false);
  });

  it("a code works only once (replay of the same or an older step is refused)", () => {
    const secret = generateSecret();
    const now = Date.UTC(2026, 11, 1, 12, 0, 15);
    const first = verifyTotp(secret, codeAt(secret, now), now, 0);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(verifyTotp(secret, codeAt(secret, now), now, first.step).ok).toBe(
        false,
      );
      expect(
        verifyTotp(secret, codeAt(secret, now - 30_000), now, first.step).ok,
      ).toBe(false);
    }
  });

  it("rejects malformed codes and builds an otpauth URI", () => {
    const secret = generateSecret();
    for (const bad of ["", "12345", "1234567", "abcdef", "12 345"])
      expect(verifyTotp(secret, bad, Date.now(), 0).ok).toBe(false);
    expect(otpauthUri(secret, "alice")).toContain(`secret=${secret}`);
  });
});
