import "server-only";
import { cache } from "react";
import { hasConfirmedTotp } from "@/lib/admin/store";
import { db } from "@/lib/supabase-admin";

/**
 * What decides a viewer's channels: the active guild and whether the session is a staff one.
 * Moderators and administrators need a staff session and confirmed TOTP for the staff channel.
 */
async function resolveViewer(user: {
  userId: string;
  site_role: string;
  isAdminSession: boolean;
}): Promise<{
  userId: string;
  guildId: string | null;
  staff: boolean;
  showCoordinates: boolean;
  /** an approved community member: only they, and staff, may see players */
  member: boolean;
}> {
  const mayBeStaff =
    (user.site_role === "admin" || user.site_role === "moderator") &&
    user.isAdminSession;
  // independent reads, so they go out together; the guild's own status needs the guild id
  const [membership, guildRow, totp] = await Promise.all([
    db()
      .from("access_memberships")
      .select("status")
      .eq("user_id", user.userId)
      .eq("status", "approved")
      .maybeSingle(),
    db()
      .from("guild_members")
      .select("guild_id")
      .eq("user_id", user.userId)
      .eq("status", "active")
      .maybeSingle(),
    mayBeStaff ? hasConfirmedTotp(user.userId) : Promise.resolve(false),
  ]);
  if (membership.error)
    throw new Error(`access_memberships select: ${membership.error.message}`);
  if (guildRow.error)
    throw new Error(`guild_members select: ${guildRow.error.message}`);
  let guildId = (guildRow.data?.guild_id as string | undefined) ?? null;
  if (guildId) {
    // guild_members has no foreign key to guilds, so the guild's status is a second read;
    // an archived guild has no channel
    const { data: guild, error } = await db()
      .from("guilds")
      .select("status")
      .eq("id", guildId)
      .single();
    if (error) throw new Error(`guilds select: ${error.message}`);
    if (guild.status !== "active") guildId = null;
  }
  const staff = mayBeStaff && totp;
  return {
    userId: user.userId,
    guildId,
    staff,
    showCoordinates: staff && user.site_role === "admin",
    member: !!membership.data,
  };
}

/** Memoised per request: the map's routes and marker reads may ask several times. */
export const loadViewer = cache(resolveViewer);
