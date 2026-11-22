import { describe, expect, it } from "vitest";
import {
  groupByTopic,
  MAX_PLAYERS_PER_BATCH,
  parsePositions,
  type Resolved,
} from "./positions";
import { guildTopic, TOPIC_ADMIN, TOPIC_ALL } from "./visibility";

const U1 = "aaaaaaaa-0000-4000-8000-000000000001";
const U2 = "aaaaaaaa-0000-4000-8000-000000000002";
const G = "11111111-1111-1111-1111-111111111111";
const at = (uuid: string, extra: object = {}) => ({
  uuid,
  dim: "overworld",
  x: 10.26,
  y: 64.4,
  z: -20.84,
  yaw: -90,
  ...extra,
});

describe("parsePositions", () => {
  it("keeps tenths of a block, rounds the height and wraps the facing", () => {
    expect(parsePositions([at(U1)])).toEqual([
      { uuid: U1, dim: "overworld", x: 10.3, y: 64, z: -20.8, yaw: 270 },
    ]);
  });
  it("skips a malformed player and keeps the others", () => {
    const out = parsePositions([
      at(U1, { x: "ten" }),
      at("not-a-uuid"),
      at(U1, { dim: "the_end" }),
      at(U1, { z: Number.NaN }),
      at(U1, { x: 1e12 }),
      null,
      at(U2),
    ]);
    expect(out.map((p) => p.uuid)).toEqual([U2]);
  });
  it("keeps the first entry of a player listed twice", () => {
    expect(parsePositions([at(U1, { x: 1 }), at(U1, { x: 2 })])).toHaveLength(
      1,
    );
  });
  it("refuses a batch that is not a list or is too large", () => {
    expect(() => parsePositions({})).toThrow();
    expect(() =>
      parsePositions(
        Array.from({ length: MAX_PLAYERS_PER_BATCH + 1 }, () => at(U1)),
      ),
    ).toThrow();
  });
});

describe("groupByTopic", () => {
  const known = new Map<string, Resolved>([
    [U1, { nickname: "Ann", visibility: "all", guildId: G }],
    [U2, { nickname: "Bob", visibility: "guild", guildId: null }],
  ]);
  const groups = groupByTopic(parsePositions([at(U1), at(U2)]), known);
  const names = (t: string) => groups.get(t)?.map((d) => d.n);

  it("puts a visible player in all and in the own guild channel", () => {
    expect(names(TOPIC_ALL)).toEqual(["Ann"]);
    expect(names(guildTopic(G))).toEqual(["Ann"]);
  });
  it("shows staff everyone, a guild-only player without a guild included", () => {
    expect(names(TOPIC_ADMIN)).toEqual(["Ann", "Bob"]);
  });
  it("carries the height to staff only", () => {
    expect(groups.get(TOPIC_ADMIN)![0]).toHaveProperty("y", 64);
    expect(groups.get(TOPIC_ALL)![0]).not.toHaveProperty("y");
  });
  it("shows a player the site does not know to staff only, without a name", () => {
    const g = groupByTopic(parsePositions([at(U1)]), new Map());
    expect([...g.keys()]).toEqual([TOPIC_ADMIN]);
    expect(g.get(TOPIC_ADMIN)![0].n).toBe("?");
  });
});
