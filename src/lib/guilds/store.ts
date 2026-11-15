import "server-only";
import { likeTerm } from "@/lib/admin/players";
import { logSecurityEvent } from "@/lib/auth/store";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "@/lib/social/errors";

export const PLAYERS_PER_PAGE = 24;

/** Codes the database functions raise; anything else is a real fault and is rethrown. */
const GUILD_CODES = new Set([
  "guild_not_found",
  "guild_archived",
  "guild_forbidden",
  "guild_rank_too_low",
  "guild_self_assign",
  "guild_rank_escalation",
  "guild_owner_conflict",
  "guild_last_owner",
  "guild_already_member",
  "guild_full",
  "guild_candidate_not_approved",
  "guild_invite_exists",
  "guild_invite_invalid",
  "guild_invite_expired",
  "guild_request_exists",
  "guild_request_not_found",
  "guild_tag_taken",
  "guild_slug_taken",
  "guild_owner_not_eligible",
  "guild_confirm_mismatch",
  "guild_member_not_found",
  "guild_bad_input",
  "reason_too_short",
  "forbidden",
  "account_not_active",
]);
/** Refusals that look like an attempt to go beyond one's rank: written to the security log. */
const SUSPICIOUS = new Set([
  "guild_rank_too_low",
  "guild_self_assign",
  "guild_rank_escalation",
  "guild_forbidden",
  "guild_last_owner",
  "guild_owner_conflict",
]);

async function call(
  actor: string | null,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await db().rpc(name, args);
  if (error) {
    if (GUILD_CODES.has(error.message)) {
      if (actor && SUSPICIOUS.has(error.message))
        await logSecurityEvent({
          type: "guild.rank_denied",
          severity: "info",
          ip: null,
          userId: actor,
          details: { code: error.message, fn: name },
        }).catch(() => undefined);
      throw new SocialError(error.message);
    }
    throw new Error(`${name}: ${error.message}`);
  }
  return data;
}

/** Exact, case-insensitive match for ILIKE: "_" and "%" are legal/special, so they are escaped. */
const exactIlike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

/** Nickname -> user id, only for players who may be addressed (an active nickname binding). */
export async function userIdByNick(nick: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return null;
  const { data } = await db()
    .from("minecraft_identities")
    .select("user_id")
    .ilike("nickname", exactIlike(nick))
    .in("binding_status", ["reserved", "confirmed"])
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/* ---------- actions (each one ends in a database function that re-checks the rules) ---------- */
export const createGuild = (
  actor: string,
  i: {
    name: string;
    slug: string;
    tag: string;
    color: string;
    description: string;
    ownerNick: string;
  },
) =>
  userIdByNick(i.ownerNick).then((owner) => {
    if (!owner) throw new SocialError("guild_owner_not_eligible");
    return call(actor, "create_guild", {
      p_actor: actor,
      p_name: i.name,
      p_slug: i.slug,
      p_tag: i.tag,
      p_color: i.color,
      p_description: i.description,
      p_owner: owner,
    }) as Promise<string>;
  });

export const assignRank = (
  actor: string,
  guild: string,
  target: string,
  level: number,
) =>
  call(actor, "guild_assign_rank", {
    p_actor: actor,
    p_guild: guild,
    p_target: target,
    p_level: level,
  });

export async function inviteByNick(actor: string, guild: string, nick: string) {
  const target = await userIdByNick(nick);
  if (!target) throw new SocialError("guild_candidate_not_approved");
  await call(actor, "guild_invite", {
    p_actor: actor,
    p_guild: guild,
    p_target: target,
  });
}

export const respondInvitation = (
  user: string,
  invitation: string,
  accept: boolean,
) =>
  call(user, "guild_respond_invitation", {
    p_user: user,
    p_invitation: invitation,
    p_accept: accept,
  });

export const requestJoin = (user: string, guild: string, message: string) =>
  call(user, "guild_request_join", {
    p_user: user,
    p_guild: guild,
    p_message: message,
  });

export const withdrawRequest = (user: string, request: string) =>
  call(user, "guild_withdraw_request", { p_user: user, p_request: request });

export const decideRequest = (
  actor: string,
  request: string,
  approve: boolean,
) =>
  call(actor, "guild_decide_request", {
    p_actor: actor,
    p_request: request,
    p_approve: approve,
  });

export const leaveGuild = (user: string) =>
  call(user, "guild_leave", { p_user: user });

export const kickMember = (
  actor: string,
  guild: string,
  target: string,
  reason: string,
) =>
  call(actor, "guild_kick", {
    p_actor: actor,
    p_guild: guild,
    p_target: target,
    p_reason: reason,
  });

export async function transferOwner(
  actor: string,
  guild: string,
  newOwnerNick: string,
  keepVice: boolean,
) {
  const target = await userIdByNick(newOwnerNick);
  if (!target) throw new SocialError("guild_owner_not_eligible");
  await call(actor, "guild_transfer_owner", {
    p_actor: actor,
    p_guild: guild,
    p_new_owner: target,
    p_keep_vice: keepVice,
  });
}

export const archiveGuild = (
  actor: string,
  guild: string,
  confirm: string,
  reason: string,
) =>
  call(actor, "guild_archive", {
    p_actor: actor,
    p_guild: guild,
    p_confirm: confirm,
    p_reason: reason,
  });

/* ---------- public reads: only through the views ---------- */
export type PublicGuild = {
  slug: string;
  name: string;
  tag: string;
  color: string;
  description: string;
  status: "active" | "archived";
  member_count: number;
};
export type PublicMember = {
  nickname: string;
  since: string | null;
  guild_slug: string | null;
  guild_name: string | null;
  guild_tag: string | null;
  guild_color: string | null;
  rank_name: string | null;
  rank_level: number | null;
};

export async function listGuilds(
  includeArchived = false,
): Promise<PublicGuild[]> {
  let q = db()
    .from("public_guilds")
    .select("slug, name, tag, color, description, status, member_count")
    .order("name");
  if (!includeArchived) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) throw new Error(`public_guilds: ${error.message}`);
  return (data ?? []) as PublicGuild[];
}

export async function getPublicGuild(
  slug: string,
): Promise<PublicGuild | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await db()
    .from("public_guilds")
    .select("slug, name, tag, color, description, status, member_count")
    .eq("slug", slug)
    .maybeSingle();
  return (data as PublicGuild | null) ?? null;
}

/** The roster as the players allowed it (show_guild): the view hides the rest. */
export async function listRoster(slug: string): Promise<PublicMember[]> {
  const { data, error } = await db()
    .from("public_members")
    .select(
      "nickname, since, guild_slug, guild_name, guild_tag, guild_color, rank_name, rank_level",
    )
    .eq("guild_slug", slug)
    .order("rank_level")
    .order("nickname");
  if (error) throw new Error(`roster: ${error.message}`);
  return (data ?? []) as PublicMember[];
}

export async function listPlayers(opts: {
  q: string;
  guild: string;
  page: number;
}) {
  let q = db()
    .from("public_members")
    .select(
      "nickname, since, guild_slug, guild_name, guild_tag, guild_color, rank_name, rank_level",
    )
    .order("nickname");
  const term = likeTerm(opts.q);
  if (term) q = q.ilike("nickname", `%${term}%`);
  if (opts.guild === "none") q = q.is("guild_slug", null);
  else if (opts.guild) q = q.eq("guild_slug", opts.guild);
  const from = opts.page * PLAYERS_PER_PAGE;
  const { data, error } = await q.range(from, from + PLAYERS_PER_PAGE);
  if (error) throw new Error(`players: ${error.message}`);
  const rows = (data ?? []) as PublicMember[];
  return {
    players: rows.slice(0, PLAYERS_PER_PAGE),
    hasMore: rows.length > PLAYERS_PER_PAGE,
  };
}

export type PublicProfile = PublicMember & {
  bio: string;
  showStats: boolean;
  posts: { id: string; body: string; createdAt: string }[];
};

/** A profile exists only for players the catalog shows; everything else is a 404, never a hint. */
export async function getPlayerProfile(
  nick: string,
): Promise<PublicProfile | null> {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) return null;
  const { data: prof } = await db()
    .from("public_profiles")
    .select("nickname, since, bio, show_stats")
    .ilike("nickname", exactIlike(nick))
    .maybeSingle();
  if (!prof) return null;
  const { data: member } = await db()
    .from("public_members")
    .select(
      "nickname, since, guild_slug, guild_name, guild_tag, guild_color, rank_name, rank_level",
    )
    .eq("nickname", prof.nickname)
    .maybeSingle();
  const uid = await userIdByNick(prof.nickname as string);
  const { data: posts } = uid
    ? await db()
        .from("posts")
        .select("id, body, created_at")
        .eq("author_id", uid)
        .eq("visibility", "public")
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };
  return {
    ...((member as PublicMember | null) ?? {
      nickname: prof.nickname as string,
      since: (prof.since as string | null) ?? null,
      guild_slug: null,
      guild_name: null,
      guild_tag: null,
      guild_color: null,
      rank_name: null,
      rank_level: null,
    }),
    bio: (prof.bio as string) ?? "",
    showStats: prof.show_stats as boolean,
    posts: (posts ?? []).map((p) => ({
      id: p.id as string,
      body: p.body as string,
      createdAt: p.created_at as string,
    })),
  };
}

/* ---------- private reads for the signed-in player and for guild leaders ---------- */
export type GuildCaps = {
  level: number;
  canInvite: boolean;
  canDecide: boolean;
  canKick: boolean;
  canAssign: boolean;
  canMakeVice: boolean;
  isLeader: boolean;
};
export const capsFor = (level: number): GuildCaps => ({
  level,
  isLeader: level <= 5,
  canInvite: level <= 5,
  canDecide: level <= 5,
  canKick: level <= 5,
  canAssign: level <= 5,
  canMakeVice: level === 1,
});

export async function getMyGuild(userId: string) {
  const { data: gm, error } = await db()
    .from("guild_members")
    .select("guild_id, rank_level")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`my guild: ${error.message}`);
  type G = { slug: string; name: string; tag: string; color: string };
  let guild:
    | (G & { id: string; level: number; rankName: string; status: string })
    | null = null;
  if (gm) {
    const [{ data: g }, { data: rank }] = await Promise.all([
      db()
        .from("guilds")
        .select("slug, name, tag, color, status")
        .eq("id", gm.guild_id)
        .single(),
      db()
        .from("guild_ranks")
        .select("name")
        .eq("guild_id", gm.guild_id)
        .eq("level", gm.rank_level)
        .single(),
    ]);
    if (g)
      guild = {
        id: gm.guild_id as string,
        ...(g as G & { status: string }),
        level: gm.rank_level as number,
        rankName: (rank?.name as string | undefined) ?? "",
      };
  }
  const [{ data: invs }, { data: reqs }] = await Promise.all([
    db()
      .from("guild_invitations")
      .select("id, expires_at, guild_id")
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    db()
      .from("guild_join_requests")
      .select("id, guild_id")
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);
  const gids = [
    ...new Set([
      ...(invs ?? []).map((i) => i.guild_id as string),
      ...(reqs ?? []).map((r) => r.guild_id as string),
    ]),
  ];
  const { data: gs } = gids.length
    ? await db()
        .from("guilds")
        .select("id, slug, name, tag, color")
        .in("id", gids)
    : { data: [] };
  const byId = new Map(
    (gs ?? []).map((g) => [g.id as string, g as unknown as G]),
  );
  return {
    guild,
    invitations: (invs ?? []).flatMap((i) => {
      const g = byId.get(i.guild_id as string);
      return g
        ? [{ id: i.id as string, expiresAt: i.expires_at as string, guild: g }]
        : [];
    }),
    requests: (reqs ?? []).flatMap((r) => {
      const g = byId.get(r.guild_id as string);
      return g ? [{ id: r.id as string, guild: g }] : [];
    }),
  };
}

/** Guild id and flags for a slug (server-side only: never sent to the browser as is). */
export async function getGuildInternal(slug: string) {
  const { data } = await db()
    .from("guilds")
    .select("id, slug, name, status, needs_owner, max_members")
    .eq("slug", slug)
    .maybeSingle();
  return data as {
    id: string;
    slug: string;
    name: string;
    status: "active" | "archived";
    needs_owner: boolean;
    max_members: number;
  } | null;
}

export async function levelInGuild(
  guildId: string,
  userId: string,
): Promise<number | null> {
  const { data } = await db()
    .from("guild_members")
    .select("rank_level")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.rank_level as number | undefined) ?? null;
}

export type ManageMember = {
  userId: string;
  nick: string;
  level: number;
  rankName: string;
};

/** Everything the management page needs; callers must have checked the leader rank first. */
export async function getManageData(guildId: string) {
  const [m, r, q, v] = await Promise.all([
    db()
      .from("guild_members")
      .select("user_id, rank_level")
      .eq("guild_id", guildId)
      .eq("status", "active")
      .order("rank_level"),
    db()
      .from("guild_ranks")
      .select("level, name")
      .eq("guild_id", guildId)
      .order("level"),
    db()
      .from("guild_join_requests")
      .select("id, user_id, message, created_at")
      .eq("guild_id", guildId)
      .eq("status", "pending")
      .order("created_at"),
    db()
      .from("guild_invitations")
      .select("id, invitee_id, expires_at")
      .eq("guild_id", guildId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);
  for (const res of [m, r, q, v])
    if (res.error) throw new Error(`guild manage data: ${res.error.message}`);
  const members = m.data ?? [];
  const ranks = (r.data ?? []) as { level: number; name: string }[];
  const reqs = q.data ?? [];
  const invs = v.data ?? [];
  const ids = [
    ...new Set([
      ...members.map((x) => x.user_id as string),
      ...reqs.map((x) => x.user_id as string),
      ...invs.map((x) => x.invitee_id as string),
    ]),
  ];
  const { data: nicks } = ids.length
    ? await db()
        .from("minecraft_identities")
        .select("user_id, nickname")
        .in("user_id", ids)
        .in("binding_status", ["reserved", "confirmed"])
    : { data: [] };
  const nickOf = new Map(
    (nicks ?? []).map((n) => [n.user_id as string, n.nickname as string]),
  );
  const nick = (id: string) => nickOf.get(id) ?? "Игрок";
  const rankName = (level: number) =>
    ranks.find((x) => x.level === level)?.name ?? "";
  return {
    members: members.map<ManageMember>((x) => ({
      userId: x.user_id as string,
      nick: nick(x.user_id as string),
      level: x.rank_level as number,
      rankName: rankName(x.rank_level as number),
    })),
    ranks,
    requests: reqs.map((x) => ({
      id: x.id as string,
      nick: nick(x.user_id as string),
      message: x.message as string,
      createdAt: x.created_at as string,
    })),
    invitations: invs.map((x) => ({
      id: x.id as string,
      nick: nick(x.invitee_id as string),
      expiresAt: x.expires_at as string,
    })),
  };
}

/** Admin list: every guild with the flags only staff see. */
export async function listGuildsAdmin() {
  const { data, error } = await db()
    .from("guilds")
    .select("id, slug, name, tag, status, needs_owner, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`guilds: ${error.message}`);
  const guilds = data ?? [];
  const { data: members } = guilds.length
    ? await db()
        .from("guild_members")
        .select("guild_id, user_id, rank_level")
        .in(
          "guild_id",
          guilds.map((g) => g.id as string),
        )
        .eq("status", "active")
    : { data: [] };
  const ids = [...new Set((members ?? []).map((m) => m.user_id as string))];
  const { data: nicks } = ids.length
    ? await db()
        .from("minecraft_identities")
        .select("user_id, nickname")
        .in("user_id", ids)
        .in("binding_status", ["reserved", "confirmed"])
    : { data: [] };
  const nickOf = new Map(
    (nicks ?? []).map((n) => [n.user_id as string, n.nickname as string]),
  );
  return guilds.map((g) => {
    const ms = (members ?? []).filter((m) => m.guild_id === g.id);
    const owner = ms.find((m) => m.rank_level === 1);
    return {
      id: g.id as string,
      slug: g.slug as string,
      name: g.name as string,
      tag: g.tag as string,
      status: g.status as "active" | "archived",
      needsOwner: g.needs_owner as boolean,
      members: ms.length,
      owner: owner ? (nickOf.get(owner.user_id as string) ?? "—") : null,
    };
  });
}

/* ---------- privacy ---------- */
export async function getPrivacy(userId: string) {
  const { data } = await db()
    .from("privacy_settings")
    .select("show_first_join, show_guild, show_stats, bio")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    showFirstJoin: data?.show_first_join ?? true,
    showGuild: data?.show_guild ?? true,
    showStats: data?.show_stats ?? false,
    bio: (data?.bio as string | undefined) ?? "",
  };
}

export async function savePrivacy(
  userId: string,
  p: {
    showFirstJoin: boolean;
    showGuild: boolean;
    showStats: boolean;
    bio: string;
  },
) {
  const bio = p.bio.trim();
  if (bio.length > 300) throw new SocialError("guild_bad_input");
  const { error } = await db().from("privacy_settings").upsert({
    user_id: userId,
    show_first_join: p.showFirstJoin,
    show_guild: p.showGuild,
    show_stats: p.showStats,
    bio,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`privacy upsert: ${error.message}`);
}
