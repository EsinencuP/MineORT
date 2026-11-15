import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRank,
  createGuild,
  kickMember,
  leaveGuild,
} from "@/lib/guilds/store";
import { upsertTelegramUser } from "@/lib/auth/store";
import { SocialError } from "@/lib/social/errors";
import { db } from "@/lib/supabase-admin";

// Integration tests against a real Supabase project: the application layer around the guild functions.
const enabled =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const users: string[] = [];
let guildId = "";

async function player(role: "player" | "admin" = "player") {
  const { userId } = await upsertTelegramUser({
    telegramId: String(7_000_000_000 + randomInt(1_000_000_000)),
    username: "g_" + randomUUID().slice(0, 6),
    name: "g",
  });
  users.push(userId);
  if (role === "admin")
    await db().from("users").update({ site_role: "admin" }).eq("id", userId);
  const nickname = "G" + randomUUID().replace(/-/g, "").slice(0, 9);
  await db().from("minecraft_identities").insert({
    user_id: userId,
    nickname,
    binding_status: "confirmed",
    game_identity: "confirmed",
  });
  await db().from("access_memberships").insert({
    user_id: userId,
    status: "approved",
    decided_at: new Date().toISOString(),
  });
  return { userId, nickname };
}

const refused = (p: Promise<unknown>, code: string) =>
  p.then(
    () => {
      throw new Error(`expected ${code}`);
    },
    (e) => {
      expect(e).toBeInstanceOf(SocialError);
      expect((e as SocialError).code).toBe(code);
    },
  );

describe.skipIf(!enabled)(
  "guild rules through the application layer (staging)",
  () => {
    let admin: Awaited<ReturnType<typeof player>>;
    let owner: Awaited<ReturnType<typeof player>>;
    let deputy: Awaited<ReturnType<typeof player>>;
    let member: Awaited<ReturnType<typeof player>>;

    beforeAll(async () => {
      admin = await player("admin");
      owner = await player();
      deputy = await player();
      member = await player();
      const tag =
        "T" + randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
      guildId = await createGuild(admin.userId, {
        name: "Интеграция " + tag,
        slug: "it-" + tag.toLowerCase(),
        tag,
        color: "#2fbf71",
        description: "",
        ownerNick: owner.nickname,
      });
      for (const p of [deputy, member]) {
        await db().rpc("guild_invite", {
          p_actor: owner.userId,
          p_guild: guildId,
          p_target: p.userId,
        });
        const { data } = await db()
          .from("guild_invitations")
          .select("id")
          .eq("invitee_id", p.userId)
          .eq("status", "pending")
          .single();
        await db().rpc("guild_respond_invitation", {
          p_user: p.userId,
          p_invitation: data!.id,
          p_accept: true,
        });
      }
      await assignRank(owner.userId, guildId, deputy.userId, 2);
    });

    afterAll(async () => {
      await db().from("guild_invitations").delete().eq("guild_id", guildId);
      await db().from("guild_join_requests").delete().eq("guild_id", guildId);
      await db().from("guild_members").delete().eq("guild_id", guildId);
      await db().from("guild_ranks").delete().eq("guild_id", guildId);
      await db().from("guilds").delete().eq("id", guildId);
      await db().from("access_memberships").delete().in("user_id", users);
      await db().from("minecraft_identities").delete().in("user_id", users);
    });

    it("turns database refusals into stable codes and logs attempts to go beyond one's rank", async () => {
      await refused(
        assignRank(member.userId, guildId, deputy.userId, 6),
        "guild_rank_too_low",
      ); // a member has no say
      await refused(
        assignRank(deputy.userId, guildId, deputy.userId, 6),
        "guild_self_assign",
      );
      await refused(
        assignRank(deputy.userId, guildId, owner.userId, 6),
        "guild_last_owner",
      );
      await refused(
        kickMember(member.userId, guildId, deputy.userId, "x"),
        "guild_rank_too_low",
      );
      await refused(leaveGuild(owner.userId), "guild_last_owner");
      const { data } = await db()
        .from("security_events")
        .select("details")
        .eq("type", "guild.rank_denied")
        .eq("user_id", deputy.userId);
      expect((data ?? []).length).toBeGreaterThanOrEqual(2);
      // a legal change still goes through and is audited in the guild scope
      await assignRank(deputy.userId, guildId, member.userId, 3);
      const { data: audit } = await db()
        .from("audit_log")
        .select("action")
        .eq("scope", "guild")
        .eq("guild_id", guildId)
        .eq("action", "guild.rank_assigned");
      expect((audit ?? []).length).toBeGreaterThanOrEqual(2);
    });
  },
);
