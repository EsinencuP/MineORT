import { NextResponse, type NextRequest } from "next/server";
import { isEnabled } from "@/lib/flags";
import { mediaSignedUrl } from "@/lib/social/media";
import { getViewer } from "@/lib/social/viewer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Image access goes through a visibility check, then a short-lived signed URL (no public file URLs). */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/media/[id]">,
) {
  if (!isEnabled("ff_p1a")) return new NextResponse(null, { status: 404 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
  const url = await mediaSignedUrl(id, await getViewer());
  if (!url) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, max-age=60" },
  });
}
