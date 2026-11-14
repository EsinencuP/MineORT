import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AccessError,
  acceptRules,
  createInvitation,
  currentRules,
  decideApplication,
  hasAcceptedCurrentRules,
  publishRules,
  redeemInvitation,
  reserveNickname,
  revokeInvitation,
  submitApplication,
  withdrawApplication,
} from "@/lib/access/store";
import { sha256Hex } from "@/lib/auth/crypto";
import { upsertTelegramUser } from "@/lib/auth/store";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project; need the service-role key (server only).
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const userIds: string[] = [];
const major = Math.floor(Date.now() / 1000); // always newer than any earlier test version
let rulesId = "";

async function makeUser(role: "player" | "moderator" | "admin" = "player") {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: null,
    name: "it",
  });
  userIds.push(userId);
  if (role !== "player")
    await db().from("users").update({ site_role: role }).eq("id", userId);
  return userId;
}
const nick = () => "t" + randomUUID().replace(/-/g, "").slice(0, 10);

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AccessError ? e.code : `other:${(e as Error).message}`;
  }
}

async function auditCount(action: string, key: string, value: string) {
  const { data } = await db()
    .from("audit_log")
    .select("id")
    .eq("action", action)
    .eq(`details->>${key}`, value);
  return data?.length ?? 0;
}

describe.skipIf(!enabled)("access rules (staging)", () => {
  let admin: string;
  beforeAll(async () => {
    admin = await makeUser("admin");
  });

  afterAll(async () => {
    const ids = userIds;
    await db().from("access_memberships").delete().in("user_id", ids);
    await db().from("invitation_redemptions").delete().in("user_id", ids);
    await db().from("applications").delete().in("user_id", ids);
    await db().from("invitations").delete().in("issued_by", ids);
    await db().from("minecraft_identities").delete().in("user_id", ids);
    await db().from("rules_acceptances").delete().in("user_id", ids);
    await db().from("rules_versions").delete().gte("version_major", major);
    // audit_log is append-only and references users: test users stay, marked deleted.
    await db()
      .from("users")
      .update({ account_status: "deleted" })
      .in("id", ids);
  });

  describe("rules", () => {
    it("only an admin publishes; versions must grow; publication is audited", async () => {
      const player = await makeUser();
      expect(await code(publishRules(player, major, 0, "x"))).toBe("forbidden");
      rulesId = await publishRules(admin, major, 0, "Rules v-test");
      expect(await code(publishRules(admin, major, 0, "dup"))).toBe(
        "version_not_newer",
      );
      expect(
        await auditCount("rules.published", "rules_version_id", rulesId),
      ).toBe(1);
      expect((await currentRules())?.id).toBe(rulesId);
    });

    it("acceptance needs the current version; a minor bump keeps it", async () => {
      const u = await makeUser();
      expect(await hasAcceptedCurrentRules(u)).toBe(false);
      expect(await code(acceptRules(u, randomUUID()))).toBe(
        "rules_version_outdated",
      );
      await acceptRules(u, rulesId);
      await acceptRules(u, rulesId); // idempotent
      expect(await hasAcceptedCurrentRules(u)).toBe(true);
    });
  });

  describe("nickname", () => {
    it("rejects bad formats", async () => {
      const u = await makeUser();
      for (const bad of [
        "ab",
        "a".repeat(17),
        "bad nick",
        "ник_имя",
        "a-b-c",
        "",
      ]) {
        expect(await code(reserveNickname(u, bad)), bad).toBe(
          "nick_invalid_format",
        );
      }
    });

    it("is idempotent, case-insensitive unique, and re-picking frees the old one", async () => {
      const a = await makeUser();
      const b = await makeUser();
      const n = nick();
      const id1 = await reserveNickname(a, n);
      expect(await reserveNickname(a, n.toUpperCase())).toBe(id1);
      expect(await code(reserveNickname(b, n.toUpperCase()))).toBe(
        "nick_taken",
      );
      await reserveNickname(a, nick()); // a changes the reservation
      expect(await code(reserveNickname(b, n))).toBe("ok"); // old one is free at once (no game history)
    });

    it("quarantine blocks others but not the previous owner; expires", async () => {
      const a = await makeUser();
      const b = await makeUser();
      const n = nick();
      const id = await reserveNickname(a, n);
      await db()
        .from("minecraft_identities")
        .update({
          binding_status: "released",
          has_game_history: true,
          quarantine_until: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .eq("id", id);
      expect(await code(reserveNickname(b, n))).toBe("nick_quarantined");
      await db()
        .from("minecraft_identities")
        .update({
          quarantine_until: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .eq("id", id);
      expect(await code(reserveNickname(b, n))).toBe("ok");
    });

    it("after admission the nickname cannot be changed by the user", async () => {
      const a = await makeUser();
      await reserveNickname(a, nick());
      await db().from("access_memberships").insert({
        user_id: a,
        status: "approved",
        decided_at: new Date().toISOString(),
      });
      expect(await code(reserveNickname(a, nick()))).toBe("nick_locked");
    });

    it("a confirmed nickname cannot be changed by the user", async () => {
      const a = await makeUser();
      const id = await reserveNickname(a, nick());
      await db()
        .from("minecraft_identities")
        .update({ binding_status: "confirmed" })
        .eq("id", id);
      expect(await code(reserveNickname(a, nick()))).toBe("nick_locked");
    });
  });

  describe("invitations", () => {
    it("only admin creates and revokes; only the hash is stored; TTL is 7 days", async () => {
      const player = await makeUser();
      expect(await code(createInvitation(player))).toBe("forbidden");
      const inv = await createInvitation(admin);
      expect(inv.token.length).toBeGreaterThanOrEqual(22); // 128 bits, base64url
      const { data } = await db()
        .from("invitations")
        .select("*")
        .eq("id", inv.id)
        .single();
      expect(data.token_hash).toBe(sha256Hex(inv.token));
      expect(JSON.stringify(data)).not.toContain(inv.token);
      const days = (Date.parse(data.expires_at) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
      expect(await code(revokeInvitation(player, inv.id))).toBe("forbidden");
    });

    it("redeems once, with clear reasons otherwise", async () => {
      const first = await makeUser();
      const second = await makeUser();
      const inv = await createInvitation(admin);

      expect(await code(redeemInvitation(first, inv.token))).toBe(
        "rules_required",
      );
      await acceptRules(first, rulesId);
      await acceptRules(second, rulesId);
      expect(await code(redeemInvitation(first, "no-such-token"))).toBe(
        "invitation_invalid",
      );
      expect(await code(redeemInvitation(first, inv.token))).toBe("ok");
      expect(await code(redeemInvitation(first, inv.token))).toBe(
        "already_member",
      );
      expect(await code(redeemInvitation(second, inv.token))).toBe(
        "invitation_exhausted",
      );

      const { data: m } = await db()
        .from("access_memberships")
        .select("status")
        .eq("user_id", first)
        .single();
      expect(m?.status).toBe("approved");
      expect(
        await auditCount("invitation.redeemed", "invitation_id", inv.id),
      ).toBe(1);
    });

    it("revoked and expired invitations show different reasons", async () => {
      const u = await makeUser();
      await acceptRules(u, rulesId);
      const revoked = await createInvitation(admin);
      await revokeInvitation(admin, revoked.id);
      expect(await code(revokeInvitation(admin, revoked.id))).toBe(
        "invitation_not_active",
      );
      expect(await code(redeemInvitation(u, revoked.token))).toBe(
        "invitation_revoked",
      );

      const expired = await createInvitation(admin);
      await db()
        .from("invitations")
        .update({ expires_at: new Date(Date.now() - 3_600_000).toISOString() })
        .eq("id", expired.id);
      expect(await code(redeemInvitation(u, expired.token))).toBe(
        "invitation_expired",
      );
      expect(
        await auditCount("invitation.revoked", "invitation_id", revoked.id),
      ).toBe(1);
    });

    it("concurrent redemption of a single-use invitation succeeds exactly once", async () => {
      const users = await Promise.all(
        Array.from({ length: 5 }, () => makeUser()),
      );
      for (const u of users) await acceptRules(u, rulesId);
      const inv = await createInvitation(admin);
      const results = await Promise.all(
        users.map((u) => code(redeemInvitation(u, inv.token))),
      );
      expect(results.filter((r) => r === "ok").length).toBe(1);
      expect(results.filter((r) => r === "invitation_exhausted").length).toBe(
        4,
      );
    });
  });

  describe("applications", () => {
    it("full lifecycle: preconditions, one pending, withdraw, decide, 7-day retry, audit", async () => {
      const u = await makeUser();
      const mod = await makeUser("moderator");
      const stranger = await makeUser();

      expect(await code(submitApplication(u, "hi"))).toBe("rules_required");
      await acceptRules(u, rulesId);
      expect(await code(submitApplication(u, "hi"))).toBe("nick_required");
      await reserveNickname(u, nick());

      await submitApplication(u, "please");
      expect(await code(submitApplication(u, "again"))).toBe(
        "application_pending",
      );
      await withdrawApplication(u);
      expect(await code(withdrawApplication(u))).toBe("no_pending_application");

      const appId = await submitApplication(u, "second try");
      expect(
        await code(decideApplication(stranger, appId, "approve", null)),
      ).toBe("forbidden");
      expect(await code(decideApplication(mod, appId, "reject", " "))).toBe(
        "reason_required",
      );
      expect(
        await code(decideApplication(mod, appId, "maybe" as "approve", null)),
      ).toBe("bad_decision");
      await decideApplication(mod, appId, "reject", "not enough info");
      expect(await code(decideApplication(mod, appId, "approve", null))).toBe(
        "already_decided",
      );
      expect(
        await auditCount("application.rejected", "application_id", appId),
      ).toBe(1);

      expect(await code(submitApplication(u, "too soon"))).toBe(
        "retry_too_soon",
      );
      await db()
        .from("applications")
        .update({
          decided_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        })
        .eq("id", appId);

      const app2 = await submitApplication(u, "after a week");
      await decideApplication(mod, app2, "approve", null);
      const { data: m } = await db()
        .from("access_memberships")
        .select("status, source_application_id")
        .eq("user_id", u)
        .single();
      expect(m).toMatchObject({
        status: "approved",
        source_application_id: app2,
      });
      expect(
        await auditCount("application.approved", "application_id", app2),
      ).toBe(1);
      expect(await code(submitApplication(u, "again"))).toBe("already_member");
    });

    it("a banned user cannot act", async () => {
      const u = await makeUser();
      await db().from("users").update({ account_status: "banned" }).eq("id", u);
      expect(await code(acceptRules(u, rulesId))).toBe("account_not_active");
      expect(await code(reserveNickname(u, nick()))).toBe("account_not_active");
    });
  });

  describe("rules: a new major version needs re-acceptance (last: changes the current version)", () => {
    it("re-acceptance is required after a major bump", async () => {
      const u = await makeUser();
      await acceptRules(u, rulesId);
      const minor = await publishRules(admin, major, 1, "minor change");
      expect(await hasAcceptedCurrentRules(u)).toBe(true); // same major
      const next = await publishRules(admin, major + 1, 0, "major change");
      expect(await hasAcceptedCurrentRules(u)).toBe(false);
      expect(await code(submitApplication(u, "x"))).toBe("rules_required");
      expect(await code(acceptRules(u, minor))).toBe("rules_version_outdated");
      await acceptRules(u, next);
      expect(await hasAcceptedCurrentRules(u)).toBe(true);
    });
  });
});
