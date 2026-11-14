import "server-only";
import { db } from "@/lib/supabase-admin";

export type ServerStatus = "online" | "offline" | "paused" | "unknown";

/** A server counts as offline after 90 s without heartbeat (protocol, section 3.1). */
export const OFFLINE_AFTER_MS = 90_000;

export function effectiveStatus(
  s: { status: string; last_heartbeat_at: string | null },
  now = Date.now(),
): ServerStatus {
  if (s.status === "paused") return "paused";
  if (!s.last_heartbeat_at) return "offline";
  return now - Date.parse(s.last_heartbeat_at) > OFFLINE_AFTER_MS
    ? "offline"
    : "online";
}

/** Public status for the landing page: "unknown" when no Bridge server is registered yet. */
export async function getPublicServerStatus(): Promise<ServerStatus> {
  const { data, error } = await db()
    .from("bridge_servers")
    .select("status, last_heartbeat_at");
  if (error || !data || data.length === 0) return "unknown";
  const states = data.map((s) => effectiveStatus(s));
  return states.includes("online")
    ? "online"
    : states.includes("paused")
      ? "paused"
      : "offline";
}

export type PublicServerInfo = {
  status: ServerStatus;
  players: number | null;
  maxPlayers: number | null;
  version: string | null;
};

/** Status plus player counts and version of the first online server (or the first one known). */
export async function getPublicServerInfo(): Promise<PublicServerInfo> {
  const { data, error } = await db()
    .from("bridge_servers")
    .select(
      "status, last_heartbeat_at, online_count, max_players, server_version",
    )
    .order("created_at");
  if (error || !data || data.length === 0)
    return {
      status: "unknown",
      players: null,
      maxPlayers: null,
      version: null,
    };
  const states = data.map((s) => effectiveStatus(s));
  const status: ServerStatus = states.includes("online")
    ? "online"
    : states.includes("paused")
      ? "paused"
      : "offline";
  const pick = data[Math.max(0, states.indexOf(status))];
  return {
    status,
    players: (pick.online_count as number | null) ?? null,
    maxPlayers: (pick.max_players as number | null) ?? null,
    version: (pick.server_version as string | null) ?? null,
  };
}
