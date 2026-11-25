import { NextResponse, type NextRequest } from "next/server";
import { readMarkerScreenshot } from "@/lib/map/marker-media";
import { getMarkerViewer } from "@/lib/map/markers";
import { guard } from "../../../respond";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]/media/[mediaId]">,
) {
  const off = guard(req, false);
  if (off) return off;
  const { id, mediaId } = await ctx.params;
  const file = await readMarkerScreenshot(
    await getMarkerViewer(),
    id,
    mediaId,
    req.nextUrl.searchParams.get("size") === "thumb",
  );
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(file.stream(), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(file.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
