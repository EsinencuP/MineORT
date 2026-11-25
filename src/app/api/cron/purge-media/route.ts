import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredTrails } from "@/lib/map/trails";
import { purgeExpiredMedia, purgeStaleIncoming } from "@/lib/social/media";

export const dynamic = "force-dynamic";

/** Daily retention cleanup for media and Atlas trail points. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 404 });
  const [purged, incoming, trails] = await Promise.all([
    purgeExpiredMedia(),
    purgeStaleIncoming(),
    purgeExpiredTrails(),
  ]);
  return NextResponse.json({ purged, incoming, trails });
}
