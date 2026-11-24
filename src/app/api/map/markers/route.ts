import type { NextRequest } from "next/server";
import { parseMarkerInput } from "@/lib/map/marker-rules";
import { validPolygon } from "@/lib/map/polygon";
import { createMarker, getMarkerViewer, listMarkers } from "@/lib/map/markers";
import { answer, fail, guard, jsonBody } from "./respond";

export const dynamic = "force-dynamic";

/**
 * GET /api/map/markers?dim=overworld: the markers of a dimension this viewer may see, and what the
 * viewer may do with markers. A guest gets the approved public ones.
 */
export async function GET(req: NextRequest) {
  const off = guard(req, false);
  if (off) return off;
  const dim = req.nextUrl.searchParams.get("dim");
  if (dim !== "overworld" && dim !== "nether") return fail("marker_invalid");
  return answer(async () => {
    const v = await getMarkerViewer();
    return {
      markers: await listMarkers(v, dim),
      me: {
        signedIn: !!v.userId,
        canCreate: v.member || v.staff,
        canLabel: v.staff,
        canModerate: v.moderator,
        inGuild: !!v.guildId,
      },
    };
  });
}

/** POST /api/map/markers puts a new marker. */
export async function POST(req: NextRequest) {
  const off = guard(req, true);
  if (off) return off;
  const body = (await jsonBody(req)) as { boundary?: unknown } | null;
  if (body?.boundary != null && !validPolygon(body.boundary))
    return fail("marker_boundary_invalid");
  const input = parseMarkerInput(body);
  if (!input) return fail("marker_invalid");
  return answer(async () => ({
    marker: await createMarker(await getMarkerViewer(), input),
  }));
}
