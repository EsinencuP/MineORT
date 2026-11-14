import { describe, expect, it } from "vitest";
import { avatarFor } from "./avatar";

describe("avatarFor", () => {
  it("is deterministic and case-insensitive", () => {
    expect(avatarFor("Steve_01")).toEqual(avatarFor("steve_01"));
  });
  it("differs between nicknames", () => {
    const set = new Set(
      ["Alex", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi"].map(
        (n) => JSON.stringify(avatarFor(n)),
      ),
    );
    expect(set.size).toBeGreaterThan(3);
  });
  it("is an 8x8 grid whose letters all have a colour", () => {
    for (const nick of ["Abc", "xyz_99", null, ""]) {
      const a = avatarFor(nick);
      expect(a.rows).toHaveLength(8);
      for (const row of a.rows) {
        expect(row).toHaveLength(8);
        for (const ch of row)
          if (ch !== ".") expect(a.palette[ch], `${nick}:${ch}`).toBeDefined();
      }
    }
  });
});
