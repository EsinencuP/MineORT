/**
 * Deterministic blocky head from a nickname. It is generated locally: no request to a skin
 * service, so a nickname typed on the site is never sent to a third party. Real skins can be
 * plugged in later; this is the fallback and the "no licence" avatar (ТЗ экран 2).
 */
export type Avatar = { rows: string[]; palette: Record<string, string> };

const HAIR = ["#3b2a1d", "#6b4a2b", "#c9a24a", "#222428", "#8a3b2a", "#d9d2c3"];
const SKIN = ["#e3b08d", "#c98f6b", "#f0c9a8", "#a8714f", "#8d5a3b"];
const EYES = ["#2b4a7a", "#2f6b4a", "#5a3b25", "#3a3f48"];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function avatarFor(nick: string | null | undefined): Avatar {
  if (!nick) {
    return {
      rows: [
        "........",
        ".gggggg.",
        ".gggggg.",
        ".gddddg.",
        ".gggggg.",
        ".gddddg.",
        ".gggggg.",
        "........",
      ],
      palette: { g: "#58636d", d: "#3b444c" },
    };
  }
  const h = hash(nick);
  const hair = HAIR[h % HAIR.length];
  const skin = SKIN[(h >>> 4) % SKIN.length];
  const eye = EYES[(h >>> 8) % EYES.length];
  const style = (h >>> 12) % 3; // 0 flat, 1 side parting, 2 spiky
  const rows = [
    style === 2 ? "h.hhhh.h" : "hhhhhhhh",
    style === 1 ? "hhhhhsss" : "hhhhhhhh",
    "hsssssss",
    "sEsssEss",
    "ssssssss",
    "sssmmsss",
    "ssssssss",
    ".ssssss.",
  ];
  return {
    rows,
    palette: { h: hair, s: skin, E: eye, m: mixColor(skin, "#7a3b2e") },
  };
}

function mixColor(a: string, b: string): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((v, i) =>
        Math.round((v + pb[i]) / 2)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
