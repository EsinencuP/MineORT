import "server-only";
import { EVENT_ID } from "@/lib/social/events";
import { db } from "@/lib/supabase-admin";

export async function isConfirmedPlayer(userId: string) {
  const { data, error } = await db()
    .from("minecraft_identities")
    .select("mc_uuid")
    .eq("user_id", userId)
    .eq("binding_status", "confirmed")
    .eq("game_identity", "confirmed")
    .maybeSingle();
  if (error) throw new Error(`game identity lookup: ${error.message}`);
  return typeof data?.mc_uuid === "string";
}

export async function communityPlayer(uuid: unknown) {
  if (typeof uuid !== "string" || !EVENT_ID.test(uuid)) return null;
  const { data, error } = await db()
    .rpc("community_player", { p_uuid: uuid })
    .maybeSingle();
  if (error) throw new Error(`confirmed player lookup: ${error.message}`);
  const player = data as { user_id: string; nickname: string } | null;
  return player ? { userId: player.user_id, nickname: player.nickname } : null;
}
