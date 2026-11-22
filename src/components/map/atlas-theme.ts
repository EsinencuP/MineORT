// The eight designs of the AtlasMap mod by erkinpaw (MIT, https://github.com/erkinpaw/atlasmap):
// colours from Theme.java, panel textures from textures/gui. Copyright (c) 2026 erkinpaw.
// See public/map/ATLASMAP-LICENSE.txt.

export type AtlasTheme = {
  id: string;
  name: string;
  /** a dark panel: the light tool icons are used on it */
  dark: boolean;
  /** gilded corners and a double border */
  ornate: boolean;
  ink: string;
  inkSoft: string;
  accent: string;
  accentLight: string;
  cream: string;
  disabled: string;
  hint: string;
  vignette: string;
  panel: string;
  panelDark: string;
};

const ui = (path: string) => `/map/ui/${path}`;

function theme(
  id: string,
  name: string,
  dark: boolean,
  ornate: boolean,
  c: Pick<
    AtlasTheme,
    | "ink"
    | "inkSoft"
    | "accent"
    | "accentLight"
    | "cream"
    | "disabled"
    | "hint"
    | "vignette"
  >,
): AtlasTheme {
  const papyrus = id === "papyrus";
  return {
    id,
    name,
    dark,
    ornate,
    ...c,
    panel: ui(papyrus ? "parchment.png" : `themes/${id}.png`),
    panelDark: ui(papyrus ? "parchment_dark.png" : `themes/${id}_dark.png`),
  };
}

export const THEMES: AtlasTheme[] = [
  theme("papyrus", "Папирус", false, true, {
    ink: "#3a2616",
    inkSoft: "#6b4a2b",
    accent: "#b88c2c",
    accentLight: "#eaca6c",
    cream: "#f6ecd0",
    disabled: "#8a7a62",
    hint: "#9a8a70",
    vignette: "#2a1a0c",
  }),
  theme("stone", "Камень", false, true, {
    ink: "#1e1e1e",
    inkSoft: "#464646",
    accent: "#b88c2c",
    accentLight: "#eaca6c",
    cream: "#d8d8d6",
    disabled: "#6e6e6e",
    hint: "#7a7a78",
    vignette: "#202020",
  }),
  theme("deepslate", "Сланец", true, true, {
    ink: "#e8e8ec",
    inkSoft: "#b4b4be",
    accent: "#4fd6c8",
    accentLight: "#a8f0e8",
    cream: "#2e2e34",
    disabled: "#80808a",
    hint: "#8a8a94",
    vignette: "#101014",
  }),
  theme("modern_light", "Светлый", false, false, {
    ink: "#1f2328",
    inkSoft: "#59636e",
    accent: "#2f6feb",
    accentLight: "#8fb4ff",
    cream: "#ffffff",
    disabled: "#9aa1a9",
    hint: "#9aa1a9",
    vignette: "#30343a",
  }),
  theme("modern_dark", "Тёмный", true, false, {
    ink: "#e6e8eb",
    inkSoft: "#a2aab4",
    accent: "#4c9aff",
    accentLight: "#9cc8ff",
    cream: "#262a31",
    disabled: "#6e7681",
    hint: "#7d8590",
    vignette: "#0a0c10",
  }),
  theme("oak", "Дерево", false, true, {
    ink: "#24160a",
    inkSoft: "#4e3218",
    accent: "#e0b040",
    accentLight: "#ffe08a",
    cream: "#e8d2a8",
    disabled: "#7a5e3c",
    hint: "#6e5638",
    vignette: "#2a1a0c",
  }),
  theme("nether", "Незер", true, true, {
    ink: "#f6e2d2",
    inkSoft: "#d8ae98",
    accent: "#ff9a3c",
    accentLight: "#ffd080",
    cream: "#3a1418",
    disabled: "#a07870",
    hint: "#b08878",
    vignette: "#1a0406",
  }),
  theme("end", "Энд", false, true, {
    ink: "#2a1a3a",
    inkSoft: "#57406e",
    accent: "#9a4fd0",
    accentLight: "#d6a8ff",
    cream: "#f2f0c8",
    disabled: "#8e8a6a",
    hint: "#8a8668",
    vignette: "#2a2a10",
  }),
];

export const DEFAULT_THEME = THEMES[0];

export const themeById = (id: string | null | undefined) =>
  THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;

/** Inline CSS variables for a theme, set on the map's root element. */
export function themeVars(t: AtlasTheme): Record<string, string> {
  return {
    "--ink": t.ink,
    "--ink-soft": t.inkSoft,
    "--ink-faint": `${t.ink}66`,
    "--ink-line": `${t.ink}50`,
    "--ink-half": `${t.ink}80`,
    "--dim": t.dark ? "rgba(0,0,0,0.56)" : "rgba(16,10,5,0.38)",
    "--gold": t.accent,
    "--gold-light": t.accentLight,
    "--cream": t.cream,
    "--disabled": t.disabled,
    "--hint": t.hint,
    "--panel": `url(${t.panel})`,
    "--panel-dark": `url(${t.panelDark})`,
  };
}

/** Path of a toolbar icon in the set that reads on this theme's panels. */
export const toolIcon = (t: AtlasTheme, name: string) =>
  `/map/ui/${t.dark ? "tools_light" : "tools"}/${name}.png`;
