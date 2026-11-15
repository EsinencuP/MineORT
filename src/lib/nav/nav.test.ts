import { describe, expect, it } from "vitest";
import { activeIndex } from "./active";
import { safeBack, withBack } from "./back";

const q = (s = "") => new URLSearchParams(s);

describe("activeIndex", () => {
  const portal = [
    { href: "/dashboard" },
    { href: "/guide" },
    { href: "/social" },
    { href: "/social/gallery" },
    { href: "/social/projects" },
    { href: "/players" },
    { href: "/players?tab=guilds", also: ["/guilds"] },
  ];

  it("marks exactly one item and prefers the most specific path", () => {
    expect(activeIndex(portal, "/social", q())).toBe(2);
    expect(activeIndex(portal, "/social/gallery", q())).toBe(3);
    expect(activeIndex(portal, "/social/gallery/abc", q("back=x"))).toBe(3);
    expect(activeIndex(portal, "/social/projects/1", q())).toBe(4);
    expect(activeIndex(portal, "/social/polls", q())).toBe(2); // falls back to the section
  });

  it("tells the guild tab from the player catalogue, and keeps guild pages in the tab", () => {
    expect(activeIndex(portal, "/players", q())).toBe(5);
    expect(activeIndex(portal, "/players", q("q=Steve"))).toBe(5);
    expect(activeIndex(portal, "/players/Steve", q())).toBe(5);
    expect(activeIndex(portal, "/players", q("tab=guilds"))).toBe(6);
    expect(activeIndex(portal, "/guilds/red", q())).toBe(6);
    expect(activeIndex(portal, "/guilds/red/manage", q())).toBe(6);
  });

  it("does not confuse a path with a longer name, and returns -1 for unknown pages", () => {
    expect(activeIndex(portal, "/guidebook", q())).toBe(-1);
    expect(activeIndex(portal, "/rules", q())).toBe(-1);
    expect(
      activeIndex([{ href: "/" }, { href: "/guide" }], "/guide", q()),
    ).toBe(1);
    expect(activeIndex([{ href: "/" }], "/", q())).toBe(0);
  });
});

describe("safeBack", () => {
  const allowed = ["/social/gallery"];

  it("keeps a same-site list address with its filters", () => {
    expect(safeBack("/social/gallery", allowed)).toBe("/social/gallery");
    expect(safeBack("/social/gallery?category=build&p=2", allowed)).toBe(
      "/social/gallery?category=build&p=2",
    );
  });

  it("rejects everything that could leave the site or the section", () => {
    for (const bad of [
      "https://evil.test/social/gallery",
      "//evil.test/social/gallery",
      "/\evil.test",
      "/\t/evil.test",
      "/social/gallery\n/x",
      "javascript:alert(1)",
      "/social/galleryx",
      "/admin/players",
      "social/gallery",
      "",
      "/" + "a".repeat(500),
    ])
      expect(safeBack(bad, allowed), bad).toBeNull();
    expect(safeBack(undefined, allowed)).toBeNull();
    expect(safeBack(["/social/gallery"], allowed)).toBeNull();
  });
});

describe("withBack", () => {
  it("appends the list address, encoded, to a plain or a query link", () => {
    expect(withBack("/social/gallery/1", "/social/gallery?p=2&a=b")).toBe(
      "/social/gallery/1?back=%2Fsocial%2Fgallery%3Fp%3D2%26a%3Db",
    );
    expect(withBack("/x?y=1", "/z")).toBe("/x?y=1&back=%2Fz");
    expect(withBack("/x", null)).toBe("/x");
  });
});
