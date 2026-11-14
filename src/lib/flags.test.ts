import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { flagGuard, isEnabled, requireFlag } from "./flags";
import { visibleMenu } from "./menu";

describe("flags", () => {
  it("is off by default and on when the env var is set", () => {
    expect(isEnabled("ff_p1a", {})).toBe(false);
    expect(isEnabled("ff_p1a", { FF_P1A: "true" })).toBe(true);
    expect(isEnabled("ff_p1b", { FF_P1B: "1" })).toBe(true);
    expect(isEnabled("ff_p1c", { FF_P1C: "false" })).toBe(false);
    expect(isEnabled(undefined, {})).toBe(true);
  });

  it("module flag needs its wave flag", () => {
    expect(isEnabled("ff_p1b_guilds", { FF_P1B_GUILDS: "true" })).toBe(false);
    expect(
      isEnabled("ff_p1b_guilds", { FF_P1B_GUILDS: "true", FF_P1B: "true" }),
    ).toBe(true);
  });

  it("route handler guard answers 404 when off, passes when on", () => {
    expect(flagGuard("ff_p1c", {})?.status).toBe(404);
    expect(flagGuard("ff_p1c", { FF_P1C: "true" })).toBeNull();
  });

  it("page guard throws notFound when off", async () => {
    await expect(requireFlag("ff_p1c")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("menu", () => {
  it("shows only P0 items with every flag off", () => {
    const labels = visibleMenu(undefined, {}).map((i) => i.label);
    expect(labels).toEqual(["Главная", "Как играть", "Личный кабинет"]);
  });

  it("adds items as waves turn on", () => {
    const env = { FF_P1A: "true", FF_P1C: "true", FF_P1C_ATLAS: "true" };
    const labels = visibleMenu(undefined, env).map((i) => i.label);
    expect(labels).toContain("Общение");
    expect(labels).toContain("Игроки");
    expect(labels).toContain("Карта");
  });

  it("hides gated children and collapses a lone child", () => {
    const players = visibleMenu(undefined, { FF_P1A: "true" }).find(
      (i) => i.label === "Игроки",
    );
    expect(players?.children).toBeUndefined();
    const withGuilds = visibleMenu(undefined, {
      FF_P1A: "true",
      FF_P1B: "true",
      FF_P1B_GUILDS: "true",
    }).find((i) => i.label === "Игроки");
    expect(withGuilds?.children?.map((c) => c.label)).toEqual([
      "Каталог игроков",
      "Гильдии",
    ]);
  });
});
