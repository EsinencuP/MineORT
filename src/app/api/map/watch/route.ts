import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";
import { markViewer } from "@/lib/map/viewers";

export const dynamic = "force-dynamic";

/** A signed-in browser with the map open checks in, so the plugin keeps sending every second. */
export async function POST() {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  if (!(await withinRateLimit(`map:watch:${user.userId}`, 60, 6)))
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  await markViewer(user.userId);
  return new NextResponse(null, { status: 204 });
}
