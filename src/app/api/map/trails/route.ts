import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withinRateLimit } from "@/lib/auth/store";
import { flagGuard } from "@/lib/flags";
import { loadTrails } from "@/lib/map/trails";
import { loadViewer } from "@/lib/map/viewer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const off = flagGuard("ff_p1c_atlas");
  if (off) return off;

  const dim = req.nextUrl.searchParams.get("dim");
  if (dim !== "overworld" && dim !== "nether")
    return NextResponse.json({ error: "invalid dimension" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in" }, { status: 401 });
  if (!(await withinRateLimit(`map:trails:${user.userId}`, 60, 30)))
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  const viewer = await loadViewer(user);
  if (!viewer.member && !viewer.staff)
    return NextResponse.json({ error: "members only" }, { status: 403 });

  return NextResponse.json(await loadTrails(viewer, dim), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
