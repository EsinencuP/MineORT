import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertTelegramUser } from "@/lib/auth/store";
import { createGuild } from "@/lib/guilds/store";
import type { MarkerInput, MarkerViewer } from "@/lib/map/marker-rules";
import {
  createMarker,
  decideMarker,
  deleteMarker,
  getMarker,
  listMarkers,
  MARKERS_PER_HOUR,
  reportMarker,
  updateMarker,
} from "@/lib/map/markers";
import { listOpenReports } from "@/lib/social/store";
import { db } from "@/lib/supabase-admin";

// Markers against a real Supabase project: who sees what (R13), premoderation (R18), limits.
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const users: string[] = [];
let guildId = "";

async function user(nick?: string) {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: "mk_" + randomUUID().slice(0, 6),
    name: "mk",
  });
  users.push(userId);
  await db().from("access_memberships").insert({
    user_id: userId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  if (nick)
    await db().from("minecraft_identities").insert({
      user_id: userId,
      nickname: nick,
      mc_uuid: randomUUID(),
      binding_status: "confirmed",
      game_identity: "confirmed",
    });
  return userId;
}
const viewer = (
  userId: string | null,
  over: Partial<MarkerViewer> = {},
): MarkerViewer => ({
  userId,
  member: !!userId,
  staff: false,
  moderator: false,
  guildId: null,
  ...over,
});
const input = (over: Partial<MarkerInput> = {}): MarkerInput => ({
  kind: "point",
  dim: "overworld",
  x: 100,
  y: 70,
  z: -200,
  name: "Мельница",
  description: "У реки",
  icon: "windmill",
  color: null,
  visibility: "public",
  ...over,
});
const ids = (list: { id: string }[]) => list.map((m) => m.id);

describe.skipIf(!enabled)("map markers (staging)", () => {
  let alice: MarkerViewer; // author, in the guild
  let bob: MarkerViewer; // member of the same guild
  let carol: MarkerViewer; // member, no guild
  let mod: MarkerViewer;
  const guest = viewer(null, { member: false });

  beforeAll(async () => {
    const admin = await user("Ad" + randomUUID().replace(/-/g, "").slice(0, 8));
    await db().from("users").update({ site_role: "admin" }).eq("id", admin);
    const aliceNick = "Al" + randomUUID().replace(/-/g, "").slice(0, 8);
    const a = await user(aliceNick);
    const tag = "K" + randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
    guildId = await createGuild(admin, {
      name: "Метки " + tag,
      slug: "mk-" + tag.toLowerCase(),
      tag,
      color: "#2fbf71",
      description: "",
      ownerNick: aliceNick,
    });
    alice = viewer(a, { guildId });
    bob = viewer(await user(), { guildId });
    carol = viewer(await user());
    mod = viewer(admin, { moderator: true, staff: true });
  });
  afterAll(async () => {
    await db().from("moderation_reports").delete().in("reporter_id", users);
    await db().from("map_markers").delete().in("author_id", users);
    await db().from("guild_members").delete().eq("guild_id", guildId);
    await db().from("guild_ranks").delete().eq("guild_id", guildId);
    await db().from("guilds").delete().eq("id", guildId);
    await db().from("minecraft_identities").delete().in("user_id", users);
    await db().from("access_memberships").delete().in("user_id", users);
    await db()
      .from("rate_limit_counters")
      .delete()
      .in(
        "key",
        users.map((id) => `map:marker:${id}`),
      );
  });

  it("keeps a private marker from everyone else, even by its id", async () => {
    const m = await createMarker(alice, input({ visibility: "private" }));
    expect(ids(await listMarkers(alice, "overworld"))).toContain(m.id);
    expect(ids(await listMarkers(carol, "overworld"))).not.toContain(m.id);
    expect(await getMarker(carol, m.id)).toBeNull();
    expect(await getMarker(guest, m.id)).toBeNull();
  });

  it("shows a guild marker to the guild and not to the others", async () => {
    const m = await createMarker(alice, input({ visibility: "guild" }));
    expect(m.status).toBe("approved");
    expect(await getMarker(bob, m.id)).not.toBeNull();
    expect(await getMarker(carol, m.id)).toBeNull();
    await expect(
      createMarker(carol, input({ visibility: "guild" })),
    ).rejects.toThrow("marker_no_guild");
  });

  it("stores a two-point route and restricts its geometry to the selected guild", async () => {
    await expect(
      createMarker(alice, input({ kind: "route", routePoints: [[0, 0]] })),
    ).rejects.toThrow("marker_route_invalid");
    const points: [number, number][] = [
      [12, -2],
      [22, -2],
    ];
    const route = await createMarker(
      alice,
      input({
        kind: "route",
        routePoints: points,
        visibility: "guild",
      }),
    );
    expect(route).toMatchObject({
      kind: "route",
      geometry: [points],
      x: 12,
      z: -2,
    });
    expect((await getMarker(bob, route.id))?.geometry).toEqual([points]);
    expect(await getMarker(carol, route.id)).toBeNull();
  });

  it("makes a path from the author's last five minutes and gives a clear empty-path error", async () => {
    const { data, error } = await db()
      .from("bridge_servers")
      .insert({ name: "Path integration fixture" })
      .select("id")
      .single();
    if (error) throw error;
    const serverId = data.id as string;
    try {
      const now = Date.now();
      const segmentAt = new Date(now - 360_000).toISOString();
      const point = (userId: string, seconds: number, x: number) => ({
        server_id: serverId,
        user_id: userId,
        dim: "nether",
        recorded_at: new Date(now - seconds * 1_000).toISOString(),
        segment_at: segmentAt,
        visibility: "all",
        x,
        y: 65,
        z: 9,
      });
      const inserted = await db()
        .from("map_trail_points")
        .insert([
          point(mod.userId!, 310, 99),
          point(mod.userId!, 10, 2),
          point(mod.userId!, 5, 8),
          point(bob.userId!, 4, 500),
          point(bob.userId!, 3, 600),
        ]);
      if (inserted.error) throw inserted.error;
      const path = await createMarker(
        mod,
        input({ kind: "path", dim: "nether", visibility: "private" }),
      );
      expect(path.geometry).toEqual([
        [
          [2, 9],
          [8, 9],
        ],
      ]);
      await expect(
        createMarker(
          carol,
          input({ kind: "path", dim: "nether", visibility: "private" }),
        ),
      ).rejects.toThrow("marker_path_empty");
    } finally {
      await db().from("bridge_servers").delete().eq("id", serverId);
    }
  });

  it("shows a public marker to its author at once and to the others after approval", async () => {
    const m = await createMarker(alice, input());
    expect(m.status).toBe("pending");
    expect(await getMarker(alice, m.id)).not.toBeNull();
    expect(await getMarker(carol, m.id)).toBeNull();
    expect(await getMarker(guest, m.id)).toBeNull();
    await decideMarker(mod.userId!, m.id, "approve", "");
    expect((await getMarker(guest, m.id))?.status).toBe("approved");
  });

  it("sends an edited public marker back to moderation", async () => {
    const m = await createMarker(alice, input({ name: "Мост" }));
    await decideMarker(mod.userId!, m.id, "approve", "");
    const edited = await updateMarker(alice, m.id, input({ name: "Мост 2" }));
    expect(edited.status).toBe("pending");
    expect(await getMarker(carol, m.id)).toBeNull();
    await expect(updateMarker(carol, m.id, input())).rejects.toThrow();
  });

  it("takes a complaint once and hides the marker for all but its author and staff", async () => {
    const m = await createMarker(alice, input({ name: "Спорная" }));
    await decideMarker(mod.userId!, m.id, "approve", "");
    await reportMarker(carol, m.id, "Оскорбительное название");
    await expect(reportMarker(carol, m.id, "Ещё раз")).rejects.toThrow(
      "report_marker_duplicate",
    );
    await expect(reportMarker(alice, m.id, "Своя")).rejects.toThrow(
      "report_own_marker",
    );
    const queued = (await listOpenReports()).find((r) => r.postId === m.id);
    expect(queued?.kind).toBe("marker");
    await decideMarker(mod.userId!, m.id, "hide", "Нарушение правил");
    expect(await getMarker(carol, m.id)).toBeNull();
    expect(await getMarker(guest, m.id)).toBeNull();
    expect(await getMarker(alice, m.id)).not.toBeNull();
    expect(await getMarker(mod, m.id)).not.toBeNull();
  });

  it("refuses labels to players and markers to guests", async () => {
    await expect(createMarker(carol, input({ kind: "label" }))).rejects.toThrow(
      "label_forbidden",
    );
    await expect(createMarker(guest, input())).rejects.toThrow(
      "marker_forbidden",
    );
    const label = await createMarker(
      mod,
      input({ kind: "label", name: "Долина" }),
    );
    expect(label.status).toBe("approved");
    expect(label.author).toBe("Администрация");
  });

  it("gives heights to staff only", async () => {
    const m = await createMarker(alice, input({ visibility: "guild" }));
    expect(await getMarker(bob, m.id)).not.toHaveProperty("y");
    expect((await getMarker(mod, m.id))?.y).toBe(70);
  });

  it("lets the author delete a marker, after which nobody sees it", async () => {
    const m = await createMarker(alice, input({ visibility: "private" }));
    await expect(deleteMarker(carol, m.id)).rejects.toThrow("marker_not_found");
    await deleteMarker(alice, m.id);
    expect(await getMarker(alice, m.id)).toBeNull();
  });

  it("refuses the eleventh marker in an hour", async () => {
    const dave = viewer(await user());
    for (let i = 0; i < MARKERS_PER_HOUR; i++)
      await createMarker(dave, input({ visibility: "private", name: `М${i}` }));
    await expect(
      createMarker(dave, input({ visibility: "private" })),
    ).rejects.toThrow("marker_rate_limited");
  });
});
