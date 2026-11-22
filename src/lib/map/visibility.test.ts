import { describe, expect, it } from "vitest";
import {
  claimsFor,
  guildTopic,
  TOPIC_ADMIN,
  TOPIC_ALL,
  topicsFor,
  topicsForViewer,
} from "./visibility";

const G = "11111111-1111-1111-1111-111111111111";

describe("topicsFor", () => {
  it("sends a player who shows to everyone to all, to the guild and to staff", () => {
    expect(topicsFor({ visibility: "all", guildId: G }).sort()).toEqual(
      [TOPIC_ADMIN, TOPIC_ALL, guildTopic(G)].sort(),
    );
  });
  it("sends a guild-only player to the guild and staff, not to all", () => {
    const t = topicsFor({ visibility: "guild", guildId: G });
    expect(t).toContain(guildTopic(G));
    expect(t).toContain(TOPIC_ADMIN);
    expect(t).not.toContain(TOPIC_ALL);
  });
  it("sends a guild-only player without a guild to staff alone", () => {
    expect(topicsFor({ visibility: "guild", guildId: null })).toEqual([
      TOPIC_ADMIN,
    ]);
  });
  it("never leaves staff out, so nobody can hide completely", () => {
    for (const visibility of ["all", "guild"] as const)
      for (const guildId of [G, null])
        expect(topicsFor({ visibility, guildId })).toContain(TOPIC_ADMIN);
  });
});

describe("viewer claims", () => {
  it("opens all for a member without a guild", () => {
    const c = claimsFor({ guildId: null, staff: false });
    expect(c).toEqual({ mo_map: "1" });
    expect(topicsForViewer(c)).toEqual([TOPIC_ALL]);
  });
  it("adds the own guild and nothing of another guild", () => {
    const t = topicsForViewer(claimsFor({ guildId: G, staff: false }));
    expect(t).toEqual([TOPIC_ALL, guildTopic(G)]);
  });
  it("opens the staff channel only for staff", () => {
    expect(
      topicsForViewer(claimsFor({ guildId: null, staff: true })),
    ).toContain(TOPIC_ADMIN);
    expect(
      topicsForViewer(claimsFor({ guildId: G, staff: false })),
    ).not.toContain(TOPIC_ADMIN);
  });
});
