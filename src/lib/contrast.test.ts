import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

// Light theme only: the first :root block holds every token.
const root = css.slice(css.indexOf(":root"), css.indexOf("@theme"));
const t: Record<string, string> = {};
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) t[m[1]] = m[2];

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum ratio]: 4.5 for body text, 3 for large text and UI parts (WCAG AA)
const pairs: [string, string, number][] = [
  ["ink", "paper", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "cream", 4.5],
  ["ink-muted", "paper", 4.5],
  ["ink-muted", "surface", 4.5],
  ["brand-700", "paper", 4.5],
  ["brand-700", "brand-50", 4.5],
  ["#ffffff", "brand-600", 4.5], // primary button label
  ["#ffffff", "brand-700", 4.5],
  ["#ffffff", "danger", 4.5],
  ["ok", "ok-bg", 4.5],
  ["warn", "warn-bg", 4.5],
  ["danger", "danger-bg", 4.5],
  ["info", "info-bg", 4.5],
  ["focus", "paper", 3],
  ["accent", "paper", 3], // big pixel headline accent
  ["brand-500", "paper", 2.2], // decorative green fills and borders only
];

describe("WCAG contrast of token pairs (light theme)", () => {
  for (const [fg, bg, min] of pairs) {
    it(`${fg} on ${bg} >= ${min}`, () => {
      const f = fg.startsWith("#") ? fg : t[fg];
      const b = bg.startsWith("#") ? bg : t[bg];
      expect(f, fg).toBeDefined();
      expect(b, bg).toBeDefined();
      expect(ratio(f, b)).toBeGreaterThanOrEqual(min);
    });
  }
});
