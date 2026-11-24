import type { NextRequest } from "next/server";
import { parseMarkerInput } from "@/lib/map/marker-rules";
import { validPolygon } from "@/lib/map/polygon";
import {
  deleteMarker,
  getMarker,
  getMarkerViewer,
  MarkerError,
  updateMarker,
} from "@/lib/map/markers";
import { answer, fail, guard, jsonBody } from "../respond";

export const dynamic = "force-dynamic";

/** GET one marker, for a link that opens the map on it. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]">,
) {
  const off = guard(req, false);
  if (off) return off;
  const { id } = await ctx.params;
  return answer(async () => {
    const marker = await getMarker(await getMarkerViewer(), id);
    if (!marker) throw new MarkerError("marker_not_found");
    return { marker };
  });
}

/** PATCH changes the card of a marker: name, description, icon, colour, visibility. */
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]">,
) {
  const off = guard(req, true);
  if (off) return off;
  const { id } = await ctx.params;
  const body = (await jsonBody(req)) as { boundary?: unknown } | null;
  if (body?.boundary != null && !validPolygon(body.boundary))
    return fail("marker_boundary_invalid");
  const input = parseMarkerInput(body);
  if (!input) return fail("marker_invalid");
  return answer(async () => ({
    marker: await updateMarker(await getMarkerViewer(), id, input),
  }));
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]">,
) {
  // a DELETE always needs a preflight from another site; the origin check still applies
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return fail("forbidden");
  const off = guard(req, false);
  if (off) return off;
  const { id } = await ctx.params;
  return answer(async () => deleteMarker(await getMarkerViewer(), id));
}
