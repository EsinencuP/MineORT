/* eslint-disable @typescript-eslint/no-explicit-any -- test helpers parse loosely typed JSON */
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { upsertTelegramUser } from "@/lib/auth/store";
import { canonicalRequest, hmacHex } from "@/lib/bridge/auth";
import { createBridgeServer, issueBridgeKey } from "@/lib/bridge/keys";
import { createGuild } from "@/lib/guilds/store";
import { db } from "@/lib/supabase-admin";

// Only the push to Realtime is replaced: the routing, the database and the token are the real ones.
const sent = vi.hoisted(() => ({
  messages: [] as { topic: string; event: string; payload: any }[],
}));
vi.mock("@/lib/map/realtime", async (original) => {
  const real = await original<typeof import("@/lib/map/realtime")>();
  return {
    ...real,
    broadcast: async (m: typeof sent.messages) => {
      sent.messages.push(...m);
    },
  };
});

import { POST as positionsRoute } from "@/app/api/bridge/v1/map/positions/route";
import { signRealtimeToken } from "@/lib/map/realtime";
import { markViewer } from "@/lib/map/viewers";
import { loadViewer } from "@/lib/map/viewer";

const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.BRIDGE_KEK;

const PATH = "/api/bridge/v1/map/positions";
let serverId = "";
let key = { keyId: "", secret: "" };
const users: string[] = [];
let guildId = "";

function request(body: unknown, opts: { badSig?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const sig = opts.badSig
    ? "0".repeat(64)
    : hmacHex(key.secret, canonicalRequest("POST", PATH, ts, nonce, raw));
  return new NextRequest(`http://localhost${PATH}`, {
    method: "POST",
    headers: {
      "x-mineort-key-id": key.keyId,
      "x-mineort-timestamp": ts,
      "x-mineort-nonce": nonce,
      "x-mineort-signature": sig,
      "content-type": "application/json",
    },
    body: raw,
  });
}
const send = async (body: unknown, opts?: { badSig?: boolean }) => {
  const r = await positionsRoute(request(body, opts));
  return { status: r.status, body: (await r.json()) as Record<string, any> };
};

async function member(visibility: "all" | "guild") {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: "p_" + randomUUID().slice(0, 6),
    name: "p",
  });
  users.push(userId);
  const nickname = "P" + randomUUID().replace(/-/g, "").slice(0, 9);
  const mcUuid = randomUUID();
  await db().from("minecraft_identities").insert({
    user_id: userId,
    nickname,
    mc_uuid: mcUuid,
    binding_status: "confirmed",
    game_identity: "confirmed",
  });
  await db().from("access_memberships").insert({
    user_id: userId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db()
    .from("privacy_settings")
    .upsert({ user_id: userId, map_visibility: visibility });
  return { userId, nickname, mcUuid };
}
const dot = (mcUuid: string) => ({
  uuid: mcUuid,
  dim: "overworld",
  x: 12.5,
  y: 70,
  z: -8.26,
  yaw: 90,
});
const topics = () => sent.messages.map((m) => m.topic).sort();
const namesIn = (topic: string) =>
  sent.messages
    .filter((m) => m.topic === topic)
    .flatMap((m) => m.payload.p.map((d: any) => d.n));
const asPlayer = (userId: string) => ({
  userId,
  site_role: "player",
  isAdminSession: false,
});

describe.skipIf(!enabled)("live positions (staging)", () => {
  let owner: Awaited<ReturnType<typeof member>>;
  let hidden: Awaited<ReturnType<typeof member>>;
  let loner: Awaited<ReturnType<typeof member>>;

  beforeAll(async () => {
    serverId = await createBridgeServer(`pos-int-${Date.now()}`);
    key = await issueBridgeKey(serverId, "A");
    const admin = await member("all");
    await db()
      .from("users")
      .update({ site_role: "admin" })
      .eq("id", admin.userId);
    owner = await member("all");
    hidden = await member("guild");
    loner = await member("all");
    const tag = "M" + randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
    guildId = await createGuild(admin.userId, {
      name: "Карта " + tag,
      slug: "pos-" + tag.toLowerCase(),
      tag,
      color: "#2fbf71",
      description: "",
      ownerNick: owner.nickname,
    });
    // nobody has the map open at the start
    await db().from("map_viewers").delete().neq("user_id", randomUUID());
  });
  beforeEach(() => {
    sent.messages.length = 0;
  });
  afterAll(async () => {
    await db().from("map_viewers").delete().in("user_id", users);
    await db().from("guild_members").delete().eq("guild_id", guildId);
    await db().from("guild_ranks").delete().eq("guild_id", guildId);
    await db().from("guilds").delete().eq("id", guildId);
    await db().from("privacy_settings").delete().in("user_id", users);
    await db().from("access_memberships").delete().in("user_id", users);
    await db().from("minecraft_identities").delete().in("user_id", users);
    await db().from("bridge_keys").delete().eq("server_id", serverId);
    await db().from("bridge_servers").delete().eq("id", serverId);
  });

  it("sends a player who shows to everyone to all, the own guild and staff", async () => {
    const r = await send({ players: [dot(owner.mcUuid)] });
    expect(r.status).toBe(200);
    expect(topics()).toEqual(
      ["map:pos:admin", "map:pos:all", `map:pos:guild:${guildId}`].sort(),
    );
    expect(namesIn("map:pos:all")).toEqual([owner.nickname]);
  });

  it("keeps the height for staff and out of the public channel", async () => {
    await send({ players: [dot(owner.mcUuid)] });
    const admin = sent.messages.find((m) => m.topic === "map:pos:admin")!;
    const all = sent.messages.find((m) => m.topic === "map:pos:all")!;
    expect(admin.payload.p[0]).toMatchObject({ x: 12.5, z: -8.3, y: 70 });
    expect(all.payload.p[0]).not.toHaveProperty("y");
  });

  it("sends a guild-only player without a guild to staff only", async () => {
    await send({ players: [dot(hidden.mcUuid)] });
    expect(topics()).toEqual(["map:pos:admin"]);
    expect(namesIn("map:pos:admin")).toEqual([hidden.nickname]);
  });

  it("sends an unknown player to staff only, without a name", async () => {
    await send({ players: [dot(randomUUID())] });
    expect(topics()).toEqual(["map:pos:admin"]);
    expect(namesIn("map:pos:admin")).toEqual(["?"]);
  });

  it("splits one batch by visibility", async () => {
    await send({
      players: [dot(owner.mcUuid), dot(hidden.mcUuid), dot(loner.mcUuid)],
    });
    expect(namesIn("map:pos:all").sort()).toEqual(
      [owner.nickname, loner.nickname].sort(),
    );
    expect(namesIn("map:pos:admin")).toHaveLength(3);
    expect(namesIn(`map:pos:guild:${guildId}`)).toEqual([owner.nickname]);
  });

  it("refuses a bad signature and a malformed batch, and sends nothing", async () => {
    const bad = await send({ players: [dot(owner.mcUuid)] }, { badSig: true });
    expect(bad.status).toBe(401);
    expect((await send({ players: "nope" })).status).toBe(400);
    expect(sent.messages).toHaveLength(0);
  });

  it("answers an empty batch without sending", async () => {
    const r = await send({ players: [] });
    expect(r.status).toBe(200);
    expect(sent.messages).toHaveLength(0);
  });

  it("asks for a batch every 10 seconds until someone watches, then every second", async () => {
    expect((await send({ players: [] })).body.interval_ms).toBe(10_000);
    await markViewer(owner.userId);
    expect((await send({ players: [] })).body.interval_ms).toBe(1000);
    await db()
      .from("map_viewers")
      .update({ seen_at: new Date(Date.now() - 120_000).toISOString() })
      .eq("user_id", owner.userId);
    expect((await send({ players: [] })).body.interval_ms).toBe(10_000);
  });

  it("gives a member the own guild channel and not a staff one", async () => {
    const v = await loadViewer(asPlayer(owner.userId));
    expect(v).toMatchObject({ guildId, staff: false });
  });

  it("does not count a signed-in user without an approved membership as a member", async () => {
    const { userId } = await upsertTelegramUser({
      telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
      username: "n_" + randomUUID().slice(0, 6),
      name: "n",
    });
    users.push(userId);
    const v = await loadViewer(asPlayer(userId));
    expect(v).toMatchObject({ member: false, staff: false });
    expect((await loadViewer(asPlayer(owner.userId))).member).toBe(true);
  });

  it("gives a member without a guild no guild channel", async () => {
    expect((await loadViewer(asPlayer(loner.userId))).guildId).toBeNull();
  });

  it("opens the staff channel only to an administrator with a confirmed TOTP", async () => {
    // the role and a staff session alone are not enough: this test user has no TOTP set up
    const v = await loadViewer({
      userId: owner.userId,
      site_role: "admin",
      isAdminSession: true,
    });
    expect(v.staff).toBe(false);
  });

  it("drops the guild channel after the member leaves, at the next token", async () => {
    await db()
      .from("guild_members")
      .update({ status: "left", ended_at: new Date().toISOString() })
      .eq("user_id", owner.userId)
      .eq("guild_id", guildId);
    expect((await loadViewer(asPlayer(owner.userId))).guildId).toBeNull();
    // the position follows the new situation at once
    await send({ players: [dot(owner.mcUuid)] });
    expect(topics()).toEqual(["map:pos:admin", "map:pos:all"]);
  });
});

describe("realtime token", () => {
  it("carries the claims the channel policy reads and lasts 10 minutes", async () => {
    process.env.SUPABASE_JWT_SECRET = "x".repeat(40);
    const { token, expiresAt } = await signRealtimeToken({
      userId: "u1",
      guildId: "g1",
      staff: false,
    });
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode("x".repeat(40)),
      { audience: "authenticated" },
    );
    expect(payload).toMatchObject({
      role: "authenticated",
      sub: "u1",
      mo_map: "1",
      mo_guild: "g1",
    });
    expect(payload).not.toHaveProperty("mo_staff");
    expect(expiresAt - (payload.iat as number)).toBe(600);
  });

  it("is refused when no signing secret is configured", async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    await expect(
      signRealtimeToken({ userId: "u1", guildId: null, staff: false }),
    ).rejects.toThrow(/SUPABASE_JWT_SECRET/);
  });
});
