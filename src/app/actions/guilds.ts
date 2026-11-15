"use server";

import { redirect } from "next/navigation";
import { requireFlag, type FlagName } from "@/lib/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireStepUp } from "@/lib/auth/guards";
import { safeReturnTo } from "@/lib/auth/session-policy";
import {
  adminEditGuild,
  archiveGuild,
  editGuildProfile,
  assignRank,
  createGuild,
  decideRequest,
  inviteByNick,
  kickMember,
  leaveGuild,
  requestJoin,
  respondInvitation,
  savePrivacy,
  transferOwner,
  withdrawRequest,
} from "@/lib/guilds/store";
import { SocialError } from "@/lib/social/errors";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

/** Runs a guild action and always ends in a redirect with ?error=code or ?ok=key. */
async function run(
  formData: FormData,
  fallback: string,
  okKey: string,
  fn: (userId: string) => Promise<unknown>,
  opts: { flag?: FlagName; adminStepUp?: boolean } = {},
): Promise<never> {
  await requireFlag(opts.flag ?? "ff_p1b_guilds");
  const back = safeReturnTo(str(formData.get("return_to")) || fallback);
  let userId: string;
  if (opts.adminStepUp) {
    // critical operations: a staff session and a fresh TOTP confirmation, checked on every call
    userId = (await requireStepUp(back, ["admin"])).userId;
  } else {
    const user = await getCurrentUser();
    if (!user)
      redirect(
        `/api/auth/telegram/start?return_to=${encodeURIComponent(back)}`,
      );
    userId = user.userId;
  }
  let error: string | null = null;
  try {
    await fn(userId);
  } catch (e) {
    if (!(e instanceof SocialError)) throw e;
    error = e.code;
  }
  const url = new URL(back, "http://x");
  url.searchParams.delete("error");
  url.searchParams.delete("ok");
  url.searchParams.set(error ? "error" : "ok", error ?? okKey);
  redirect(url.pathname + url.search);
}

const level = (v: FormDataEntryValue | null) => Number.parseInt(str(v), 10);

export async function createGuildAction(formData: FormData) {
  return run(
    formData,
    "/admin/guilds",
    "created",
    (uid) =>
      createGuild(uid, {
        name: str(formData.get("name")),
        slug: str(formData.get("slug")),
        tag: str(formData.get("tag")),
        color: str(formData.get("color")) || "#2fbf71",
        description: str(formData.get("description")),
        ownerNick: str(formData.get("owner")),
      }),
    { adminStepUp: true },
  );
}

export async function transferOwnerAction(formData: FormData) {
  return run(
    formData,
    "/admin/guilds",
    "transferred",
    (uid) =>
      transferOwner(
        uid,
        str(formData.get("guild_id")),
        str(formData.get("new_owner")),
        formData.get("keep_vice") === "on",
      ),
    { adminStepUp: true },
  );
}

export async function archiveGuildAction(formData: FormData) {
  return run(
    formData,
    "/admin/guilds",
    "archived",
    (uid) =>
      archiveGuild(
        uid,
        str(formData.get("guild_id")),
        str(formData.get("confirm")),
        str(formData.get("reason")),
      ),
    { adminStepUp: true },
  );
}

export async function assignRankAction(formData: FormData) {
  return run(formData, "/dashboard", "rank", (uid) =>
    assignRank(
      uid,
      str(formData.get("guild_id")),
      str(formData.get("target")),
      level(formData.get("level")),
    ),
  );
}

export async function kickMemberAction(formData: FormData) {
  return run(formData, "/dashboard", "kicked", (uid) =>
    kickMember(
      uid,
      str(formData.get("guild_id")),
      str(formData.get("target")),
      str(formData.get("reason")),
    ),
  );
}

export async function inviteMemberAction(formData: FormData) {
  return run(formData, "/dashboard", "invited", (uid) =>
    inviteByNick(uid, str(formData.get("guild_id")), str(formData.get("nick"))),
  );
}

export async function respondInvitationAction(formData: FormData) {
  const accept = formData.get("decision") === "accept";
  return run(formData, "/dashboard", accept ? "joined" : "declined", (uid) =>
    respondInvitation(uid, str(formData.get("invitation_id")), accept),
  );
}

export async function requestJoinAction(formData: FormData) {
  return run(formData, "/guilds", "requested", (uid) =>
    requestJoin(
      uid,
      str(formData.get("guild_id")),
      str(formData.get("message")),
    ),
  );
}

export async function withdrawRequestAction(formData: FormData) {
  return run(formData, "/guilds", "withdrawn", (uid) =>
    withdrawRequest(uid, str(formData.get("request_id"))),
  );
}

export async function decideRequestAction(formData: FormData) {
  const approve = formData.get("decision") === "approve";
  return run(formData, "/dashboard", approve ? "approved" : "rejected", (uid) =>
    decideRequest(uid, str(formData.get("request_id")), approve),
  );
}

export async function leaveGuildAction(formData: FormData) {
  return run(formData, "/dashboard", "left", (uid) => leaveGuild(uid));
}

export async function savePrivacyAction(formData: FormData) {
  return run(
    formData,
    "/dashboard",
    "privacy",
    (uid) =>
      savePrivacy(uid, {
        showFirstJoin: formData.get("show_first_join") === "on",
        showGuild: formData.get("show_guild") === "on",
        showStats: formData.get("show_stats") === "on",
        bio: str(formData.get("bio")),
      }),
    { flag: "ff_p1a" },
  );
}

export async function editGuildProfileAction(formData: FormData) {
  return run(formData, "/dashboard", "profile", (uid) =>
    editGuildProfile(
      uid,
      str(formData.get("guild_id")),
      str(formData.get("description")),
    ),
  );
}

export async function adminEditGuildAction(formData: FormData) {
  return run(
    formData,
    "/admin/guilds",
    "edited",
    (uid) =>
      adminEditGuild(uid, str(formData.get("guild_id")), {
        name: str(formData.get("name")),
        color: str(formData.get("color")),
        description: str(formData.get("description")),
        maxMembers: Number.parseInt(str(formData.get("max_members")), 10),
      }),
    { adminStepUp: true },
  );
}
