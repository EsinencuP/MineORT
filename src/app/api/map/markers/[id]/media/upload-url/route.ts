import type { NextRequest } from "next/server";
import { startMarkerScreenshot } from "@/lib/map/marker-media";
import { getMarkerViewer } from "@/lib/map/markers";
import { answer, guard } from "../../../respond";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]/media/upload-url">,
) {
  const off = guard(req, true);
  if (off) return off;
  const { id } = await ctx.params;
  return answer(async () => startMarkerScreenshot(await getMarkerViewer(), id));
}
