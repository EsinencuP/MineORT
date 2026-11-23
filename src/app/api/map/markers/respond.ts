import { NextResponse, type NextRequest } from "next/server";
import { messageFor } from "@/lib/access/messages";
import { isEnabled } from "@/lib/flags";
import { MarkerError } from "@/lib/map/markers";

const STATUS: Record<string, number> = {
  marker_not_found: 404,
  marker_rate_limited: 429,
  marker_forbidden: 403,
  label_forbidden: 403,
  forbidden: 403,
};

/** 404 with the map switched off, 403 for a write from another site or without a JSON body. */
export function guard(req: NextRequest, write: boolean) {
  if (!isEnabled("ff_p1c_atlas"))
    return new NextResponse(null, { status: 404 });
  if (write) {
    // a cross-site form cannot send JSON without a preflight, and a browser says where it came from
    if (
      req.headers.get("sec-fetch-site") === "cross-site" ||
      !(req.headers.get("content-type") ?? "").startsWith("application/json")
    )
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export const fail = (code: string) =>
  NextResponse.json(
    { error: code, message: messageFor(code) },
    { status: STATUS[code] ?? 400, headers: { "Cache-Control": "no-store" } },
  );

/** Runs a marker operation and turns its stable errors into JSON answers. */
export async function answer(fn: () => Promise<unknown>) {
  try {
    const body = await fn();
    return NextResponse.json(body ?? { ok: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof MarkerError) return fail(e.code);
    throw e;
  }
}

export async function jsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
