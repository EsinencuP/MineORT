import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccessError } from "@/lib/access/store";
import {
  confirmTotp,
  getTotpState,
  startTotpEnrollment,
  stepUp,
} from "@/lib/admin/store";
import { codeAt, stepAt } from "@/lib/admin/totp";
import {
  deleteAccount,
  getPlayer,
  searchPlayers,
  setAccountStatus,
} from "@/lib/admin/players";
import {
  createSession,
  isTombstoneBlocked,
  resolveSession,
  upsertTelegramUser,
} from "@/lib/auth/store";
import { createBridgeServer } from "@/lib/bridge/keys";
import { telegramIdHash } from "@/lib/secrets";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project (service key, bridge KEK and tombstone key needed).
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.BRIDGE_KEK &&
  !!process.env.TOMBSTONE_HMAC_KEY &&
  !!process.env.BRIDGE_ED25519_PRIVATE_KEY;

const userIds: string[] = [];
const tgIds: string[] = [];
let serverId = "";
let admin = "";

async function makeUser(role: "player" | "moderator" | "admin" = "player") {
  const telegramId = String(7_000_000_000 + randomInt(1_000_000_000));
  const { userId } = await upsertTelegramUser({
    telegramId,
    username: "cab_" + randomUUID().slice(0, 6),
    name: "cab",
  });
  userIds.push(userId);
  tgIds.push(telegramId);
  if (role !== "player")
    await db().from("users").update({ site_role: role }).eq("id", userId);
  return { userId, telegramId };
}
const nick = () => "C" + randomUUID().replace(/-/g, "").slice(0, 9);

/** A player with nickname, approved admission and an applied whitelist entry. */
async function admittedPlayer(history = false) {
  const p = await makeUser();
  const nickname = nick();
  await db()
    .from("minecraft_identities")
    .insert({ user_id: p.userId, nickname, has_game_history: history });
  await db().from("access_memberships").insert({
    user_id: p.userId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  await db().from("whitelist_entries").insert({
    user_id: p.userId,
    nickname,
    desired: "on",
    applied_state: "applied",
  });
  return { ...p, nickname };
}
async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AccessError ? e.code : `other:${(e as Error).message}`;
  }
}

describe.skipIf(!enabled)(
  "cabinet and admin: restrictions, deletion, TOTP (staging)",
  () => {
    beforeAll(async () => {
      serverId = await createBridgeServer("it-" + randomUUID().slice(0, 8));
      admin = (await makeUser("admin")).userId;
    });

    afterAll(async () => {
      const { data: acts } = await db()
        .from("server_actions")
        .select("id")
        .eq("server_id", serverId);
      const ids = (acts ?? []).map((a) => a.id);
      if (ids.length)
        await db().from("server_action_attempts").delete().in("action_id", ids);
      await db().from("server_actions").delete().eq("server_id", serverId);
      await db().from("bridge_servers").delete().eq("id", serverId);
      await db()
        .from("deletion_tombstones")
        .delete()
        .in("telegram_id_hash", tgIds.map(telegramIdHash));
      await db().from("admin_totp").delete().in("user_id", userIds);
      await db().from("user_sessions").delete().in("user_id", userIds);
      await db().from("whitelist_entries").delete().in("user_id", userIds);
      await db().from("access_memberships").delete().in("user_id", userIds);
      await db().from("minecraft_identities").delete().in("user_id", userIds);
      await db().from("telegram_identities").delete().in("user_id", userIds);
      // audit_log is append-only and references users: the test users stay, marked deleted
      await db()
        .from("users")
        .update({ account_status: "deleted" })
        .in("id", userIds);
    });

    describe("suspend, ban, unban", () => {
      it("only an admin can do it, and never to themself; a reason is required", async () => {
        const target = await admittedPlayer();
        const mod = (await makeUser("moderator")).userId;
        expect(
          await code(setAccountStatus(mod, target.userId, "ban", "x", null)),
        ).toBe("forbidden");
        expect(
          await code(setAccountStatus(admin, admin, "ban", "x", null)),
        ).toBe("cannot_target_self");
        expect(
          await code(setAccountStatus(admin, target.userId, "ban", " ", null)),
        ).toBe("reason_required");
        expect(
          await code(setAccountStatus(admin, randomUUID(), "ban", "x", null)),
        ).toBe("user_not_found");
      });

      it("suspend: sessions die, admission is suspended, whitelist goes off and the game side is told", async () => {
        const t = await admittedPlayer();
        const s = await createSession({
          userId: t.userId,
          ip: null,
          userAgent: null,
        });
        expect(await resolveSession(s.token)).not.toBeNull();

        await setAccountStatus(admin, t.userId, "suspend", "spam", null);
        expect(await resolveSession(s.token)).toBeNull();
        const p = await getPlayer(t.userId);
        expect(p?.user).toMatchObject({
          account_status: "suspended",
          restriction_reason: "spam",
        });
        expect(p?.membership?.status).toBe("suspended");
        expect(p?.whitelist).toMatchObject({ desired: "off" });
        const { data } = await db()
          .from("server_actions")
          .select("type")
          .eq("user_id", t.userId)
          .eq("server_id", serverId);
        expect((data ?? []).map((a) => a.type).sort()).toEqual([
          "player.kick",
          "whitelist.remove",
        ]);
        expect(p?.identities[0].binding_status).toBe("reserved"); // a suspension keeps the nickname
        expect(
          await code(
            setAccountStatus(admin, t.userId, "suspend", "again", null),
          ),
        ).toBe("bad_transition");
      });

      it("unban of a suspension restores admission and queues whitelist.add again", async () => {
        const t = await admittedPlayer();
        await setAccountStatus(admin, t.userId, "suspend", "cool off", null);
        const out = await setAccountStatus(
          admin,
          t.userId,
          "unban",
          null,
          null,
        );
        expect(out.restored).toBe(true);
        const p = await getPlayer(t.userId);
        expect(p?.user.account_status).toBe("active");
        expect(p?.membership?.status).toBe("approved");
        expect(p?.whitelist).toMatchObject({
          desired: "on",
          applied_state: "pending",
        });
        const { data } = await db()
          .from("server_actions")
          .select("type")
          .eq("user_id", t.userId)
          .eq("type", "whitelist.add");
        expect(data).toHaveLength(1);
      });

      it("ban: admission revoked, nickname quarantined with history, tombstone written; unban keeps admission revoked", async () => {
        const t = await admittedPlayer(true);
        await setAccountStatus(
          admin,
          t.userId,
          "ban",
          "griefing",
          new Date(Date.now() + 200 * 86_400_000),
        );
        const p = await getPlayer(t.userId);
        expect(p?.user.account_status).toBe("banned");
        expect(p?.membership).toMatchObject({
          status: "revoked",
          revoke_reason: "banned",
        });
        const id = p!.identities[0];
        expect(id.binding_status).toBe("released");
        const days =
          (Date.parse(id.quarantine_until!) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(199); // max(90 days, ban length)
        expect(await isTombstoneBlocked(t.telegramId)).toBe(true);

        await setAccountStatus(admin, t.userId, "unban", null, null);
        expect(await isTombstoneBlocked(t.telegramId)).toBe(false);
        const after = await getPlayer(t.userId);
        expect(after?.user.account_status).toBe("active");
        expect(after?.membership?.status).toBe("revoked"); // re-admission is a separate decision (OD-48)
      });

      it("a nickname without game history is freed at once on ban", async () => {
        const t = await admittedPlayer(false);
        await setAccountStatus(admin, t.userId, "ban", "x", null);
        const p = await getPlayer(t.userId);
        expect(p?.identities[0]).toMatchObject({
          binding_status: "released",
          quarantine_until: null,
        });
      });

      it("every change is audited", async () => {
        const t = await admittedPlayer();
        await setAccountStatus(admin, t.userId, "ban", "audit me", null);
        const { data } = await db()
          .from("audit_log")
          .select("action, details")
          .eq("action", "user.banned")
          .eq("details->>user_id", t.userId);
        expect(data).toHaveLength(1);
        expect(data![0].details).toMatchObject({ reason: "audit me" });
      });
    });

    describe("account deletion", () => {
      it("self-deletion removes access, sessions and the Telegram binding; it is idempotent", async () => {
        const t = await admittedPlayer(true);
        const s = await createSession({
          userId: t.userId,
          ip: null,
          userAgent: null,
        });
        const out = await deleteAccount(t.userId, t.userId);
        expect(out.already).toBe(false);
        expect(await resolveSession(s.token)).toBeNull();
        const { data: tg } = await db()
          .from("telegram_identities")
          .select("user_id")
          .eq("user_id", t.userId);
        expect(tg).toHaveLength(0);
        const p = await getPlayer(t.userId);
        expect(p?.user).toMatchObject({
          account_status: "deleted",
          display_name: null,
        });
        expect(p?.membership?.status).toBe("revoked");
        expect(p?.identities[0].binding_status).toBe("released");
        expect(p?.identities[0].quarantine_until).not.toBeNull(); // played before: nickname quarantined
        const { data: acts } = await db()
          .from("server_actions")
          .select("type")
          .eq("user_id", t.userId)
          .eq("server_id", serverId);
        expect((acts ?? []).map((a) => a.type).sort()).toEqual([
          "player.kick",
          "whitelist.remove",
        ]);
        expect((await deleteAccount(t.userId, t.userId)).already).toBe(true);
        // a normal deletion does not block signing in again
        expect(await isTombstoneBlocked(t.telegramId)).toBe(false);
      });

      it("a banned or suspended user cannot delete themself (no ban evasion)", async () => {
        for (const action of ["ban", "suspend"] as const) {
          const t = await admittedPlayer();
          await setAccountStatus(admin, t.userId, action, "x", null);
          expect(await code(deleteAccount(t.userId, t.userId))).toBe(
            "delete_forbidden_banned",
          );
          expect((await getPlayer(t.userId))?.user.account_status).toBe(
            action === "ban" ? "banned" : "suspended",
          );
        }
      });

      it("an admin deleting a banned account keeps the ban: the tombstone blocks the identity", async () => {
        const t = await admittedPlayer();
        await setAccountStatus(admin, t.userId, "ban", "permanent", null); // no end date
        await deleteAccount(admin, t.userId);
        expect(await isTombstoneBlocked(t.telegramId)).toBe(true);
        const { data } = await db()
          .from("deletion_tombstones")
          .select("banned, ban_until, purge_after")
          .eq("telegram_id_hash", telegramIdHash(t.telegramId))
          .single();
        expect(data).toEqual({
          banned: true,
          ban_until: null,
          purge_after: null,
        }); // permanent
        // only the hash is stored, never the Telegram ID
        const { data: raw } = await db()
          .from("deletion_tombstones")
          .select("*")
          .eq("telegram_id_hash", telegramIdHash(t.telegramId))
          .single();
        expect(JSON.stringify(raw)).not.toContain(t.telegramId);
      });

      it("a limited ban expires in the tombstone", async () => {
        const t = await admittedPlayer();
        await setAccountStatus(
          admin,
          t.userId,
          "ban",
          "short",
          new Date(Date.now() + 3_600_000),
        );
        await deleteAccount(admin, t.userId);
        expect(await isTombstoneBlocked(t.telegramId)).toBe(true);
        await db()
          .from("deletion_tombstones")
          .update({ ban_until: new Date(Date.now() - 1000).toISOString() })
          .eq("telegram_id_hash", telegramIdHash(t.telegramId));
        expect(await isTombstoneBlocked(t.telegramId)).toBe(false);
      });

      it("only an admin can delete somebody else", async () => {
        const a = await admittedPlayer();
        const b = await admittedPlayer();
        expect(await code(deleteAccount(a.userId, b.userId))).toBe("forbidden");
      });
    });

    describe("search", () => {
      it("finds by nickname, Telegram username and display name; control characters are harmless", async () => {
        const t = await admittedPlayer();
        expect(
          (await searchPlayers(t.nickname.toLowerCase())).some(
            (p) => p.id === t.userId,
          ),
        ).toBe(true);
        const { data } = await db()
          .from("telegram_identities")
          .select("username")
          .eq("user_id", t.userId)
          .single();
        expect(
          (await searchPlayers(data!.username as string)).some(
            (p) => p.id === t.userId,
          ),
        ).toBe(true);
        expect(await searchPlayers("zzzz-no-such-player-zzzz")).toEqual([]);
        await expect(searchPlayers('%_,()"')).resolves.toBeDefined();
      });
    });

    describe("TOTP and step-up", () => {
      it("enrollment shows the secret until the first valid code; a code works once; step-up lasts 15 minutes", async () => {
        const u = (await makeUser("admin")).userId;
        expect(await getTotpState(u)).toEqual({
          confirmed: false,
          pending: false,
        });
        const secret = await startTotpEnrollment(u);
        expect(await startTotpEnrollment(u)).toBe(secret); // same secret until confirmed
        expect(await getTotpState(u)).toEqual({
          confirmed: false,
          pending: true,
        });

        const s = await createSession({
          userId: u,
          isAdmin: true,
          ip: null,
          userAgent: null,
        });
        const session = (await resolveSession(s.token))!;
        expect(await stepUp(u, session.sessionId, codeAt(secret))).toBe(
          "not_configured",
        ); // not confirmed yet

        expect(await confirmTotp(u, "000000")).toBe("invalid");
        expect(await confirmTotp(u, codeAt(secret))).toBe("ok");
        expect((await getTotpState(u)).confirmed).toBe(true);

        // the confirmation code is spent: the same step cannot be reused for a step-up
        expect(await stepUp(u, session.sessionId, codeAt(secret))).toBe(
          "invalid",
        );
        const next = codeAt(secret, Date.now() + 30_000);
        expect(await stepUp(u, session.sessionId, next)).toBe("ok");
        const fresh = (await resolveSession(s.token))!;
        const minutes = (Date.parse(fresh.stepUpUntil!) - Date.now()) / 60_000;
        expect(minutes).toBeGreaterThan(14);
        expect(minutes).toBeLessThanOrEqual(15);
        expect(stepAt(Date.now())).toBeGreaterThan(0);
      });

      it("wrong codes are rate limited (5 per 5 minutes)", async () => {
        const u = (await makeUser("admin")).userId;
        const secret = await startTotpEnrollment(u);
        await confirmTotp(u, codeAt(secret));
        const s = await createSession({
          userId: u,
          isAdmin: true,
          ip: null,
          userAgent: null,
        });
        const session = (await resolveSession(s.token))!;
        const results: string[] = [];
        for (let i = 0; i < 7; i++)
          results.push(await stepUp(u, session.sessionId, "111111"));
        expect(results.slice(0, 4)).toEqual([
          "invalid",
          "invalid",
          "invalid",
          "invalid",
        ]); // 1 attempt used by confirm
        expect(results.slice(5)).toEqual(["rate_limited", "rate_limited"]);
        // while limited, even a correct code is refused
        expect(
          await stepUp(
            u,
            session.sessionId,
            codeAt(secret, Date.now() + 30_000),
          ),
        ).toBe("rate_limited");
      });

      it("the secret is stored encrypted, not in clear text", async () => {
        const u = (await makeUser("admin")).userId;
        const secret = await startTotpEnrollment(u);
        const { data } = await db()
          .from("admin_totp")
          .select("secret_enc")
          .eq("user_id", u)
          .single();
        expect(data!.secret_enc).not.toContain(secret);
      });
    });
  },
);
