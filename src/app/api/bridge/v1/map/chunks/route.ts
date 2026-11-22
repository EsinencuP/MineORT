import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { parseChunkBatch } from "@/lib/map/ingest";
import { rebuildRegions, type Dim } from "@/lib/map/regions";
import { db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Chunks the Paper plugin reports as explored or changed. A chunk replaces the stored one only when
 * its version is newer, so a repeated or late batch changes nothing.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  let chunks: unknown;
  try {
    chunks = JSON.parse(raw).chunks;
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  if (!Array.isArray(chunks))
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);

  let batch: ReturnType<typeof parseChunkBatch>;
  try {
    batch = parseChunkBatch(chunks);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  const results: {
    dim: unknown;
    cx: unknown;
    cz: unknown;
    result: "stored" | "stale" | "rejected";
    code?: string;
  }[] = batch.rejected.map((r) => ({
    dim: r.dim,
    cx: r.cx,
    cz: r.cz,
    result: "rejected",
    code: r.code,
  }));

  if (batch.accepted.length > 0) {
    const { data, error } = await db().rpc("map_ingest_chunks", {
      p_server_id: auth.serverId,
      p_chunks: batch.accepted,
    });
    if (error) throw new Error(`map_ingest_chunks: ${error.message}`);
    for (const row of data as {
      out_dim: string;
      out_cx: number;
      out_cz: number;
      out_stored: boolean;
    }[]) {
      results.push({
        dim: row.out_dim,
        cx: row.out_cx,
        cz: row.out_cz,
        result: row.out_stored ? "stored" : "stale",
      });
    }
    // Redraw the regions this batch changed. A failed build is not an error for the plugin: the
    // region stays dirty and is built when a viewer asks for it.
    try {
      await rebuildRegions(
        (
          data as {
            out_dim: Dim;
            out_cx: number;
            out_cz: number;
            out_stored: boolean;
          }[]
        )
          .filter((row) => row.out_stored)
          .map((row) => ({
            serverId: auth.serverId,
            dim: row.out_dim,
            rx: row.out_cx >> 5,
            rz: row.out_cz >> 5,
          })),
      );
    } catch (error) {
      console.error("map region rebuild failed", error);
    }
  }
  return bridgeJson({ results });
}
