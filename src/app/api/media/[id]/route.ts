import { NextResponse, type NextRequest } from "next/server";
import { isEnabled } from "@/lib/flags";
import { readMedia } from "@/lib/social/media";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep Storage credentials and URLs on the server. */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/media/[id]">,
) {
  if (!isEnabled("ff_p1a")) return new NextResponse(null, { status: 404 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const found = await readMedia(
    id,
    getViewer,
    req.nextUrl.searchParams.get("size") === "thumb",
  );
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(found.stream(), {
    headers: {
      "Content-Type": found.type || "image/webp",
      "Content-Length": String(found.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
