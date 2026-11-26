import "server-only";
import { db } from "@/lib/supabase-admin";
import type { Dim, Position } from "./positions";
import {
  simplifyTrail,
  type TrailHistory,
  type TrailPoint,
} from "./trail-geometry";

export async function recordTrailPositions(
  serverId: string,
  positions: Position[],
) {
  if (!positions.length) return;
  const { error } = await db().rpc("map_record_trails", {
    p_server: serverId,
    p_positions: positions,
  });
  if (error) throw new Error(`map_record_trails: ${error.message}`);
}

type StoredTrack = {
  mine: boolean;
  points: TrailPoint[];
};

export async function loadTrails(
  viewer: { userId: string; staff: boolean },
  dim: Dim,
): Promise<TrailHistory> {
  const { data, error } = await db().rpc("map_read_trails", {
    p_user: viewer.userId,
    p_staff: viewer.staff,
    p_dim: dim,
  });
  if (error) throw new Error(`map_read_trails: ${error.message}`);

  const { nickname, tracks, latest } = data as {
    nickname: string | null;
    tracks: StoredTrack[];
    latest: number | null;
  };
  const trails = tracks.map(({ mine, points }) => ({
    mine,
    points: simplifyTrail(points),
  }));
  return { nickname, trails, ownLatestAt: latest };
}

export async function purgeExpiredTrails() {
  const { data, error } = await db().rpc("map_purge_trails");
  if (error) throw new Error(`map_purge_trails: ${error.message}`);
  return data as number;
}
