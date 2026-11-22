import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";
import { RealtimeUnconfigured, signRealtimeToken } from "@/lib/map/realtime";
import { topicsForViewer } from "@/lib/map/visibility";
import { loadViewer } from "@/lib/map/viewer";

export const dynamic = "force-dynamic";

/**
 * Token for the private position channels, for a signed-in user. It lasts 10 minutes and the
 * browser asks again before it ends, so a change of guild or of staff session shows up within
 * that time. A guest gets nothing.
 */
export async function GET() {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  if (!(await withinRateLimit(`map:token:${user.userId}`, 60, 10)))
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );

  const viewer = await loadViewer(user);
  // being signed in is not enough: the map shows players to approved members and staff only
  if (!viewer.member && !viewer.staff)
    return NextResponse.json({ error: "members only" }, { status: 403 });

  try {
    const { token, expiresAt, claims } = await signRealtimeToken(viewer);
    return NextResponse.json(
      { token, expiresAt, topics: topicsForViewer(claims) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof RealtimeUnconfigured)
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    throw e;
  }
}
