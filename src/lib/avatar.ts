/**
 * Base avatars are the faces of Minecraft's own default skins (Steve, Alex, Ari, Kai, Noor, Sunny),
 * cut out by `scripts/extract-avatars.mjs` into `public/avatars/`. A nickname always maps to the same
 * one, so a player keeps their face everywhere without any request to a skin service: the nickname
 * typed on the site is never sent to a third party. Real player skins can be added later.
 */
export const SKINS = ["steve", "alex", "ari", "kai", "noor", "sunny"] as const;
export type Skin = (typeof SKINS)[number];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** The base skin for a nickname; null when there is no nickname yet. Case-insensitive. */
export function skinFor(nick: string | null | undefined): Skin | null {
  if (!nick) return null;
  return SKINS[hash(nick) % SKINS.length];
}
