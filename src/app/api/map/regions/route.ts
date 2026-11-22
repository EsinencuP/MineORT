import { NextResponse, type NextRequest } from "next/server";
import {
  listRegions,
  loadRegions,
  mapServerId,
  MAX_REGIONS_PER_REQUEST,
} from "@/lib/map/server";
import { flagGuard } from "@/lib/flags";

export const dynamic = "force-dynamic";

const PAIR = /^-?\d{1,5}:-?\d{1,5}$/;

/**
 * GET /api/map/regions?dim=overworld&r=0:0,1:0&known=0:0:1730000000 returns layers;
 * ?dim=overworld&index=1 lists the regions that have one.
 * The drawn world is public: it carries terrain and outlines only, never players.
 */
export async function GET(req: NextRequest) {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  const q = req.nextUrl.searchParams;
  const dim = q.get("dim");
  if (dim !== "overworld" && dim !== "nether") {
    return NextResponse.json({ error: "bad dim" }, { status: 400 });
  }
  if (q.get("index") === "1") {
    const id = await mapServerId();
    const regions = id ? await listRegions(id, dim) : [];
    return NextResponse.json(
      { regions },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const refs = (q.get("r") ?? "").split(",").filter(Boolean);
  if (
    refs.length === 0 ||
    refs.length > MAX_REGIONS_PER_REQUEST ||
    !refs.every((r) => PAIR.test(r))
  ) {
    return NextResponse.json({ error: "bad regions" }, { status: 400 });
  }
  const known = new Map<string, number>();
  for (const k of (q.get("known") ?? "").split(",").filter(Boolean)) {
    const [rx, rz, v] = k.split(":");
    if (PAIR.test(`${rx}:${rz}`) && /^\d{1,16}$/.test(v ?? "")) {
      known.set(`${rx}:${rz}`, Number(v));
    }
  }

  const serverId = await mapServerId();
  if (!serverId) return NextResponse.json({ regions: [] });
  const regions = await loadRegions(
    serverId,
    dim,
    refs.map((r) => {
      const [rx, rz] = r.split(":").map(Number);
      return { rx, rz };
    }),
    known,
  );
  return NextResponse.json(
    { regions },
    { headers: { "Cache-Control": "no-store" } },
  );
}
