// Who may see a player on the map. Pure rules, no I/O, so they can be tested without a database.

export type MapVisibility = "all" | "guild";

export const TOPIC_ALL = "map:pos:all";
export const TOPIC_ADMIN = "map:pos:admin";
export const guildTopic = (guildId: string) => `map:pos:guild:${guildId}`;
export const sessionTopic = (sessionId: string) =>
  `map:pos:session:${sessionId}`;

/**
 * Channels a player's position goes to. Staff always get it, whatever the player chose (a player
 * can narrow the audience but cannot hide completely). A guild-only player without a guild is
 * seen by staff only.
 */
export function topicsFor(p: {
  visibility: MapVisibility;
  guildId: string | null;
}): string[] {
  const topics = [TOPIC_ADMIN];
  if (p.visibility === "all") topics.push(TOPIC_ALL);
  if (p.guildId) topics.push(guildTopic(p.guildId));
  return topics;
}

/** Claims a viewer's Realtime token carries; the database policy reads exactly these. */
export type ViewerClaims = {
  mo_map: "1";
  mo_guild?: string;
  mo_staff?: "1";
};

export function claimsFor(v: {
  guildId: string | null;
  staff: boolean;
}): ViewerClaims {
  return {
    mo_map: "1",
    ...(v.guildId ? { mo_guild: v.guildId } : {}),
    ...(v.staff ? { mo_staff: "1" as const } : {}),
  };
}

/** Channels the claims open, for the browser to subscribe to (the database enforces the same). */
export function topicsForViewer(c: ViewerClaims): string[] {
  const topics = [TOPIC_ALL];
  if (c.mo_guild) topics.push(guildTopic(c.mo_guild));
  if (c.mo_staff) topics.push(TOPIC_ADMIN);
  return topics;
}
