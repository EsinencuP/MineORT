import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE } from "./session-policy";
import { resolveSession } from "./store";

/**
 * Current signed-in user from the session cookie, or null. Memoised per request: the header, the
 * layout and the page all ask, but the session is read from the database once.
 */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? resolveSession(token) : null;
});
