import { NextResponse, type NextRequest } from "next/server";
import { listRegions, mapRegionAnchor, mapServerId } from "@/lib/map/server";
import { parseRegionBounds } from "@/lib/map/region-bounds";
import { clientIp, withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";

export const dynamic = "force-dynamic";

/**
 * Lists explored regions intersecting the requested viewport.
 * The drawn world is public: it carries terrain only, never players.
 */
export async function GET(req: NextRequest) {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  const dim = req.nextUrl.searchParams.get("dim");
  if (dim !== "overworld" && dim !== "nether") {
    return NextResponse.json({ error: "bad dim" }, { status: 400 });
  }
  const params = req.nextUrl.searchParams;
  const bounds = parseRegionBounds(params);
  if (
    !bounds &&
    ["minX", "minZ", "maxX", "maxZ"].some((name) => params.has(name))
  ) {
    return NextResponse.json({ error: "bad bounds" }, { status: 400 });
  }
  if (
    !(await withinRateLimit(`map:regions:${clientIp(req.headers)}`, 60, 60))
  ) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }
  const id = await mapServerId();
  const regions = id && bounds ? await listRegions(id, dim, bounds) : [];
  const anchor =
    id && params.has("anchor") ? await mapRegionAnchor(id, dim) : null;
  return NextResponse.json(
    { regions, anchor },
    { headers: { "Cache-Control": "no-store" } },
  );
}
