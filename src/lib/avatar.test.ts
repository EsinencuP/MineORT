import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKINS, skinFor } from "./avatar";

describe("skinFor", () => {
  it("is deterministic and case-insensitive", () => {
    expect(skinFor("Steve_01")).toBe(skinFor("steve_01"));
  });
  it("uses several of the base skins", () => {
    const set = new Set(
      ["Alex", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"].map(
        (n) => skinFor(n),
      ),
    );
    expect(set.size).toBeGreaterThan(2);
  });
  it("has no skin without a nickname", () => {
    for (const nick of [null, undefined, ""]) expect(skinFor(nick)).toBeNull();
  });
  it("only returns skins that exist as files", () => {
    for (const skin of SKINS)
      expect(
        existsSync(join(process.cwd(), "public", "avatars", `${skin}.png`)),
        skin,
      ).toBe(true);
  });
});
