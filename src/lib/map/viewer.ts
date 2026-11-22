import "server-only";
import { hasConfirmedTotp } from "@/lib/admin/store";
import { db } from "@/lib/supabase-admin";

/**
 * What decides a viewer's channels: the active guild and whether the session is a staff one.
 * Only an administrator with a staff session and confirmed TOTP sees the staff channel.
 */
export async function loadViewer(user: {
  userId: string;
  site_role: string;
  isAdminSession: boolean;
}): Promise<{
  userId: string;
  guildId: string | null;
  staff: boolean;
  /** an approved community member: only they, and staff, may see players */
  member: boolean;
}> {
  const { data: membership, error: memberError } = await db()
    .from("access_memberships")
    .select("status")
    .eq("user_id", user.userId)
    .eq("status", "approved")
    .maybeSingle();
  if (memberError)
    throw new Error(`access_memberships select: ${memberError.message}`);
  const { data, error } = await db()
    .from("guild_members")
    .select("guild_id")
    .eq("user_id", user.userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`guild_members select: ${error.message}`);
  let guildId = (data?.guild_id as string | undefined) ?? null;
  if (guildId) {
    // an archived guild has no channel
    const { data: guild, error: guildError } = await db()
      .from("guilds")
      .select("status")
      .eq("id", guildId)
      .single();
    if (guildError) throw new Error(`guilds select: ${guildError.message}`);
    if (guild.status !== "active") guildId = null;
  }
  const staff =
    user.site_role === "admin" &&
    user.isAdminSession &&
    (await hasConfirmedTotp(user.userId));
  return {
    userId: user.userId,
    guildId,
    staff,
    member: !!membership,
  };
}
