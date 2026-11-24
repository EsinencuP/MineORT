import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createMarker, listMarkers } from "@/lib/map/markers";
import { GUEST_VIEWER } from "@/lib/map/marker-rules";
import { mapRegionAnchor } from "@/lib/map/server";
import { createPost, listFeed } from "@/lib/social/store";
import type { Viewer } from "@/lib/social/viewer";

const request = vi.hoisted(() => vi.fn<typeof fetch>());
vi.mock("@/lib/supabase-admin", () => ({
  db: () => client,
}));
const client = createClient("http://fixture.local", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: request },
});

const userId = "00000000-0000-4000-8000-000000000001";
const postId = "00000000-0000-4000-8000-000000000002";
const markerId = "00000000-0000-4000-8000-000000000003";
const viewer: Viewer = {
  userId,
  cls: "member",
  canPublish: true,
  canModerate: false,
};
const body = "Публикация со старой схемой";
const now = "2026-11-24T12:00:00Z";
const marker = {
  id: markerId,
  author_id: userId,
  kind: "point" as const,
  dim: "overworld" as const,
  x: 5,
  y: null,
  z: -8,
  name: "Спавн",
  description: "",
  icon: "pin",
  color: null,
  visibility: "public" as const,
  moderation_status: "approved",
  deleted_at: null,
  created_at: now,
};

describe("community schema rollout", () => {
  beforeEach(() => {
    vi.stubEnv("FF_P1A", "true");
    vi.stubEnv("FF_SOCIAL_COMMENTS", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    request.mockReset();
  });

  it("publishes and reads a text post without the newer columns or tables", async () => {
    let post: Record<string, unknown> | undefined;
    request.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/hit_rate_limit")) return Response.json(true);
      if (url.pathname.endsWith("/posts")) {
        if (init?.method === "POST") {
          post = JSON.parse(String(init.body)) as Record<string, unknown>;
          if (
            ["linked_type", "linked_id", "cover_media_id"].some(
              (key) => key in post!,
            )
          )
            return Response.json({ code: "PGRST204" }, { status: 400 });
          post = { ...post, id: postId, created_at: now };
          return Response.json({ id: postId });
        }
        if (url.searchParams.get("select")?.includes("cover_media_id"))
          return Response.json({ code: "42703" }, { status: 400 });
        return Response.json(post ? [post] : []);
      }
      if (/community_(bookmarks|follows)$/.test(url.pathname))
        return Response.json({ code: "PGRST205" }, { status: 404 });
      if (
        /\/(media_attachments|reactions|users|minecraft_identities|telegram_identities)$/.test(
          url.pathname,
        )
      )
        return Response.json([]);
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    await expect(
      createPost(viewer, {
        body,
        kind: "post",
        visibility: "public",
        pinned: false,
        incomingPaths: [],
        galleryMediaIds: [],
      }),
    ).resolves.toBe(postId);
    await expect(listFeed(viewer, "all")).resolves.toMatchObject({
      posts: [{ id: postId, body }],
    });
  });

  it("loads and creates ordinary markers before the boundary column exists", async () => {
    request.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/hit_rate_limit")) return Response.json(true);
      if (url.pathname.endsWith("/community_bookmarks"))
        return Response.json({ code: "PGRST205" }, { status: 404 });
      if (!url.pathname.endsWith("/map_markers")) return Response.json([]);
      if (init?.method === "HEAD")
        return new Response(null, { headers: { "content-range": "*/0" } });
      if (
        url.searchParams.get("select")?.includes("boundary") ||
        (init?.method === "POST" && "boundary" in JSON.parse(String(init.body)))
      )
        return Response.json({ code: "42703" }, { status: 400 });
      return Response.json(init?.method === "POST" ? marker : [marker]);
    });
    const member = { ...GUEST_VIEWER, userId, member: true };
    await expect(listMarkers(member, "overworld")).resolves.toMatchObject([
      { id: markerId, name: "Спавн" },
    ]);
    await expect(
      createMarker(member, { ...marker, boundary: null }),
    ).resolves.toMatchObject({ id: markerId });
  });

  it("uses both extremes of each axis to calculate the center", async () => {
    request.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const order = url.searchParams.get("order");
      const rows = {
        "rx.asc": { rx: -8 },
        "rx.desc": { rx: 10 },
        "rz.asc": { rz: -4 },
        "rz.desc": { rz: 0 },
      };
      const extreme = rows[order as keyof typeof rows];
      if (!extreme) throw new Error(`Unexpected order ${order}`);
      return Response.json([extreme]);
    });
    await expect(mapRegionAnchor("world", "overworld")).resolves.toEqual({
      rx: 1,
      rz: -2,
    });
  });
});
