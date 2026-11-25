import type { NextRequest } from "next/server";
import {
  attachMarkerScreenshots,
  listMarkerScreenshots,
} from "@/lib/map/marker-media";
import { getMarkerViewer } from "@/lib/map/markers";
import { answer, fail, guard, jsonBody } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]/media">,
) {
  const off = guard(req, false);
  if (off) return off;
  const { id } = await ctx.params;
  return answer(async () => ({
    screenshots: await listMarkerScreenshots(await getMarkerViewer(), id),
  }));
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/map/markers/[id]/media">,
) {
  const off = guard(req, true);
  if (off) return off;
  const { id } = await ctx.params;
  const body = (await jsonBody(req)) as { uploads?: unknown } | null;
  const uploads = body?.uploads;
  if (
    !Array.isArray(uploads) ||
    !uploads.every((path) => typeof path === "string")
  )
    return fail("upload_missing");
  return answer(async () => ({
    screenshots: await attachMarkerScreenshots(
      await getMarkerViewer(),
      id,
      uploads,
    ),
  }));
}
