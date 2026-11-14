import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-policy";
import { resolveSession, revokeAllSessions } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await resolveSession(token) : null;
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await revokeAllSessions(session.userId);
  const res = NextResponse.redirect(
    new URL("/", process.env.APP_URL ?? req.nextUrl.origin),
    303,
  );
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
