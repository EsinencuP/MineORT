import "server-only";
import { db } from "@/lib/supabase-admin";

export const FAST_INTERVAL_MS = 1000;
export const SLOW_INTERVAL_MS = 5_000;
/** A browser with the map open checks in every 30 s; two missed check-ins and it counts as gone. */
export const VIEWER_TTL_MS = 60_000;

export async function hasViewers(): Promise<boolean> {
  const { count, error } = await db()
    .from("map_viewers")
    .select("user_id", { count: "exact", head: true })
    .gte("seen_at", new Date(Date.now() - VIEWER_TTL_MS).toISOString());
  if (error) throw new Error(`map_viewers count: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function markViewer(userId: string): Promise<void> {
  const { error } = await db()
    .from("map_viewers")
    .upsert({ user_id: userId, seen_at: new Date().toISOString() });
  if (error) throw new Error(`map_viewers upsert: ${error.message}`);
}

export async function markLiveSession(sessionId: string) {
  const { error } = await db()
    .from("map_live_watches")
    .upsert({ session_id: sessionId, seen_at: new Date().toISOString() });
  if (error) throw new Error(`map live watch: ${error.message}`);
}
