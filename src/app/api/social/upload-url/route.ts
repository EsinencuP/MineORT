import { NextResponse, type NextRequest } from "next/server";
import { isEnabled } from "@/lib/flags";
import { SocialError } from "@/lib/social/errors";
import { createUploadTarget } from "@/lib/social/media";
import { getViewer } from "@/lib/social/viewer";
import { messageFor } from "@/lib/access/messages";

export const dynamic = "force-dynamic";

/** Hands a member a one-shot upload address; the file itself is checked and converted when the post is saved. */
export async function POST(req: NextRequest) {
  if (!isEnabled("ff_p1a")) return new NextResponse(null, { status: 404 });
  if (req.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer.userId || !viewer.canPublish)
    return NextResponse.json(
      { error: "post_forbidden", message: messageFor("post_forbidden") },
      { status: 403 },
    );
  try {
    return NextResponse.json(await createUploadTarget(viewer.userId));
  } catch (e) {
    if (e instanceof SocialError)
      return NextResponse.json(
        { error: e.code, message: messageFor(e.code) },
        { status: e.code === "upload_rate_limited" ? 429 : 400 },
      );
    throw e;
  }
}
