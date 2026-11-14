import { describe, expect, it } from "vitest";
import { effectiveStatus } from "../site/server-status";
import {
  isBuildOutdated,
  sanitizeQuery,
  validateArticle,
  type ArticleInput,
} from "./store";

const ok: ArticleInput = {
  slug: "install-client",
  category: "install",
  title: "Установка",
  summary: "",
  body: "text",
  tags: [],
  published: true,
  verifiedAt: "2026-12-01",
};

describe("guides", () => {
  it("strips filter and LIKE control characters from search queries", () => {
    expect(sanitizeQuery('a,b)%_*"x')).toBe("a b x");
    expect(sanitizeQuery("   ")).toBe("");
    expect(sanitizeQuery("x".repeat(200)).length).toBe(60);
  });

  it("validates slug, category, title and date", () => {
    expect(() => validateArticle(ok)).not.toThrow();
    for (const bad of [
      { slug: "Bad Slug" },
      { slug: "a--b" },
      { category: "nope" },
      { title: "  " },
      { verifiedAt: "01.12.2026" },
    ]) {
      expect(() => validateArticle({ ...ok, ...bad })).toThrow();
    }
  });

  it("flags a build as outdated only when both versions are known and differ", () => {
    expect(isBuildOutdated("1.2.0", "1.1.0")).toBe(true);
    expect(isBuildOutdated("1.2.0", "1.2.0")).toBe(false);
    expect(isBuildOutdated("", "1.1.0")).toBe(false);
    expect(isBuildOutdated("1.2.0", "")).toBe(false);
  });
});

describe("server status", () => {
  const now = Date.parse("2026-12-01T12:00:00Z");
  it("is offline after 90 s without heartbeat; paused wins", () => {
    expect(
      effectiveStatus(
        {
          status: "online",
          last_heartbeat_at: new Date(now - 30_000).toISOString(),
        },
        now,
      ),
    ).toBe("online");
    expect(
      effectiveStatus(
        {
          status: "online",
          last_heartbeat_at: new Date(now - 91_000).toISOString(),
        },
        now,
      ),
    ).toBe("offline");
    expect(
      effectiveStatus({ status: "online", last_heartbeat_at: null }, now),
    ).toBe("offline");
    expect(
      effectiveStatus(
        { status: "paused", last_heartbeat_at: new Date(now).toISOString() },
        now,
      ),
    ).toBe("paused");
  });
});
