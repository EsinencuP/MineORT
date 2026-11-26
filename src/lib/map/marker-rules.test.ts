import { describe, expect, it } from "vitest";
import {
  canDelete,
  canEdit,
  canSee,
  GUEST_VIEWER,
  parseMarkerInput,
  statusFor,
  type MarkerRow,
  type MarkerViewer,
} from "./marker-rules";

const row = (over: Partial<MarkerRow> = {}): MarkerRow => ({
  id: "m1",
  author_id: "author",
  kind: "point",
  dim: "overworld",
  x: 10,
  y: 64,
  z: -5,
  name: "Дом",
  description: "",
  icon: "house",
  color: null,
  visibility: "public",
  guild_id: null,
  moderation_status: "approved",
  deleted_at: null,
  created_at: "2026-11-22T00:00:00Z",
  updated_at: "2026-11-22T00:00:00Z",
  ...over,
});
const player = (over: Partial<MarkerViewer> = {}): MarkerViewer => ({
  userId: "someone",
  member: true,
  staff: false,
  moderator: false,
  guildId: null,
  ...over,
});
const author = player({ userId: "author" });

describe("who sees a marker", () => {
  it("shows an approved public marker to everyone, guests included", () => {
    expect(canSee(GUEST_VIEWER, row())).toBe(true);
    expect(canSee(player(), row())).toBe(true);
  });

  it("keeps a private marker to its author", () => {
    const m = row({ visibility: "private" });
    expect(canSee(author, m)).toBe(true);
    expect(canSee(player(), m)).toBe(false);
    expect(canSee(GUEST_VIEWER, m)).toBe(false);
  });

  it("shows a guild marker to that guild only", () => {
    const m = row({ visibility: "guild", guild_id: "g1" });
    expect(canSee(player({ guildId: "g1" }), m)).toBe(true);
    expect(canSee(player({ guildId: "g2" }), m)).toBe(false);
    expect(canSee(player(), m)).toBe(false);
  });

  it("shows a pending public marker to its author and moderators, not to others", () => {
    const m = row({ moderation_status: "pending" });
    expect(canSee(author, m)).toBe(true);
    expect(canSee(player({ moderator: true }), m)).toBe(true);
    expect(canSee(player(), m)).toBe(false);
  });

  it("hides a hidden marker from everyone but its author and moderators", () => {
    const m = row({ moderation_status: "hidden" });
    expect(canSee(player(), m)).toBe(false);
    expect(canSee(GUEST_VIEWER, m)).toBe(false);
    expect(canSee(player({ moderator: true }), m)).toBe(true);
  });

  it("shows a deleted marker to nobody", () => {
    const m = row({ deleted_at: "2026-11-22T01:00:00Z" });
    expect(canSee(author, m)).toBe(false);
    expect(canSee(player({ moderator: true }), m)).toBe(false);
  });
});

describe("who changes a marker", () => {
  it("lets the author edit and delete, a moderator delete only", () => {
    expect(canEdit(author, row())).toBe(true);
    expect(canEdit(player({ moderator: true }), row())).toBe(false);
    expect(canDelete(player({ moderator: true }), row())).toBe(true);
    expect(canDelete(player(), row())).toBe(false);
  });

  it("leaves labels to administrators", () => {
    const label = row({ kind: "label" });
    expect(canEdit(author, label)).toBe(false);
    expect(canEdit(player({ staff: true }), label)).toBe(true);
  });

  it("sends a player's public marker to moderation, and nothing else", () => {
    expect(statusFor(player(), "public")).toBe("pending");
    expect(statusFor(player(), "guild")).toBe("approved");
    expect(statusFor(player(), "private")).toBe("approved");
    expect(statusFor(player({ moderator: true }), "public")).toBe("approved");
  });
});

describe("marker input", () => {
  const ok = {
    dim: "overworld",
    x: 12,
    z: -40,
    name: "  Шахта  ",
    description: "Алмазы на -59",
    icon: "mine",
    color: "#B03A2E",
    visibility: "guild",
  };

  it("accepts a valid marker, trims and lowers what it should", () => {
    expect(parseMarkerInput(ok)).toEqual({
      kind: "point",
      dim: "overworld",
      x: 12,
      y: null,
      z: -40,
      name: "Шахта",
      description: "Алмазы на -59",
      icon: "mine",
      color: "#b03a2e",
      visibility: "guild",
    });
  });

  it("refuses an unknown icon, a bad colour, a long name, fractional or far coordinates", () => {
    expect(parseMarkerInput({ ...ok, icon: "../../etc" })).toBeNull();
    expect(parseMarkerInput({ ...ok, color: "red" })).toBeNull();
    expect(parseMarkerInput({ ...ok, name: "x".repeat(61) })).toBeNull();
    expect(parseMarkerInput({ ...ok, name: "   " })).toBeNull();
    expect(parseMarkerInput({ ...ok, x: 1.5 })).toBeNull();
    expect(parseMarkerInput({ ...ok, z: 40_000_000 })).toBeNull();
    expect(parseMarkerInput({ ...ok, visibility: "everyone" })).toBeNull();
    expect(parseMarkerInput({ ...ok, dim: "end" })).toBeNull();
    expect(parseMarkerInput(null)).toBeNull();
  });

  it.each(["path", "route"])(
    "rejects creating a %s marker and accepts editing its existing card",
    (kind) => {
      expect(parseMarkerInput({ ...ok, kind })).toBeNull();
      expect(parseMarkerInput({ ...ok, kind }, "update")?.kind).toBe(kind);
    },
  );
});
