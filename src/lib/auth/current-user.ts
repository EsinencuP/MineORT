import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-policy";
import { resolveSession } from "./store";

/** Current signed-in user from the session cookie, or null. */
export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? resolveSession(token) : null;
}
