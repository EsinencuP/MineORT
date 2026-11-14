import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./current-user";

/** Signed-in user or redirect to login, keeping the return address. */
export async function requireUser(returnTo: string) {
  const user = await getCurrentUser();
  if (!user)
    redirect(
      `/api/auth/telegram/start?return_to=${encodeURIComponent(returnTo)}`,
    );
  return user;
}

/** Staff gate for admin pages and actions; anyone else gets 404-like redirect home. */
export async function requireStaff(
  roles: ("moderator" | "admin")[] = ["moderator", "admin"],
) {
  const user = await getCurrentUser();
  if (!user || !(roles as string[]).includes(user.site_role)) redirect("/");
  return user;
}
