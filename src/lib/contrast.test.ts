import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    out[m[1]] = m[2];
  }
  return out;
}

const light = tokens(css.split("@media")[0]);
const dark = tokens(css.split("@media (prefers-color-scheme: dark)")[1]);

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const pairs: [string, string][] = [
  ["ink", "paper"],
  ["ink", "surface"],
  ["ink-muted", "paper"],
  ["ink-muted", "surface"],
  ["brand-700", "paper"],
  ["brand-700", "brand-50"],
  ["ok", "ok-bg"],
  ["warn", "warn-bg"],
  ["danger", "danger-bg"],
  ["info", "info-bg"],
  ["focus", "paper"],
];

describe("WCAG AA contrast of token pairs", () => {
  for (const [name, set] of [
    ["light", light],
    ["dark", { ...light, ...dark }],
  ] as const) {
    for (const [fg, bg] of pairs) {
      it(`${name}: ${fg} on ${bg} >= 4.5`, () => {
        expect(ratio(set[fg], set[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${name}: white text on brand-600 button >= 4.5`, () => {
      expect(ratio("#ffffff", set["brand-600"])).toBeGreaterThanOrEqual(
        name === "light" ? 4.5 : 0,
      );
    });
  }
});
