import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-policy";
import { revokeSession } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  const res = NextResponse.redirect(
    new URL("/", process.env.APP_URL ?? req.nextUrl.origin),
    303,
  );
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
