import type { NextRequest } from "next/server";
import { getMarkerViewer, reportMarker } from "@/lib/map/markers";
import { answer, guard, jsonBody } from "../../respond";

export const dynamic = "force-dynamic";

/** POST { reason } sends a complaint about a marker to the moderation queue. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]/report">,
) {
  const off = guard(req, true);
  if (off) return off;
  const { id } = await ctx.params;
  const body = (await jsonBody(req)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason : "";
  return answer(async () => reportMarker(await getMarkerViewer(), id, reason));
}
