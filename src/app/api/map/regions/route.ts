import { NextResponse, type NextRequest } from "next/server";
import { listRegions, mapServerId } from "@/lib/map/server";
import { clientIp, withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";

export const dynamic = "force-dynamic";

/**
 * GET /api/map/regions?dim=overworld lists the explored regions with the version of their tile.
 * The drawn world is public: it carries terrain only, never players.
 */
export async function GET(req: NextRequest) {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  if (!(await withinRateLimit(`map:regions:${clientIp(req.headers)}`, 60, 60))) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }
  const dim = req.nextUrl.searchParams.get("dim");
  if (dim !== "overworld" && dim !== "nether") {
    return NextResponse.json({ error: "bad dim" }, { status: 400 });
  }
  const id = await mapServerId();
  const regions = id ? await listRegions(id, dim) : [];
  return NextResponse.json(
    { regions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
