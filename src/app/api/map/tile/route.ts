import { NextResponse, type NextRequest } from "next/server";
import { loadTile, mapServerId } from "@/lib/map/server";
import { clientIp, withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";

export const dynamic = "force-dynamic";

const INT = /^-?\d{1,5}$/;

/**
 * GET /api/map/tile?dim=overworld&rx=0&rz=0[&v=123] is the picture of one 512 x 512 block region,
 * one pixel per block. With the current version in `v` the answer may be cached for good; the
 * viewer learns the versions from /api/map/regions. The drawn world is public.
 */
export async function GET(req: NextRequest) {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  const q = req.nextUrl.searchParams;
  const dim = q.get("dim");
  const rx = q.get("rx") ?? "";
  const rz = q.get("rz") ?? "";
  if (
    (dim !== "overworld" && dim !== "nether") ||
    !INT.test(rx) ||
    !INT.test(rz)
  ) {
    return NextResponse.json({ error: "bad tile" }, { status: 400 });
  }
  // A viewer loads several tiles at once. Limit work before opening or rebuilding each tile.
  if (!(await withinRateLimit(`map:tile:${clientIp(req.headers)}`, 60, 240))) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }
  const serverId = await mapServerId();
  const tile = serverId ? await loadTile(serverId, dim, +rx, +rz) : null;
  if (!tile) return new NextResponse(null, { status: 404 });

  const etag = `"${tile.version}"`;
  const pinned = q.get("v") === String(tile.version);
  const headers = {
    ETag: etag,
    "Cache-Control": pinned
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(tile.png), {
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
