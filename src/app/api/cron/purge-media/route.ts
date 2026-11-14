import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredMedia, purgeStaleIncoming } from "@/lib/social/media";

export const dynamic = "force-dynamic";

/** Daily job: removes files whose 30-day retention after a delete has ended (OD-40). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    purged: await purgeExpiredMedia(),
    incoming: await purgeStaleIncoming(),
  });
}
