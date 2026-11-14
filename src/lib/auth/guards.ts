import "server-only";
import { redirect } from "next/navigation";
import { hasConfirmedTotp, isStepUpFresh } from "@/lib/admin/store";
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

/**
 * Staff gate for admin pages and actions. Besides the role it needs a staff (12 h) session, and
 * every staff member must have TOTP configured (AC-34): without it only /admin/security opens.
 */
export async function requireStaff(
  roles: ("moderator" | "admin")[] = ["moderator", "admin"],
  opts: { allowWithoutTotp?: boolean } = {},
) {
  const user = await getCurrentUser();
  if (!user || !(roles as string[]).includes(user.site_role)) redirect("/");
  if (!user.isAdminSession)
    redirect("/api/auth/telegram/start?return_to=/admin"); // sign in again for a staff session
  if (!opts.allowWithoutTotp && !(await hasConfirmedTotp(user.userId)))
    redirect("/admin/security");
  return user;
}

/** Critical operations need a fresh TOTP confirmation (15 minutes). */
export async function requireStepUp(
  returnTo: string,
  roles: ("moderator" | "admin")[] = ["admin"],
) {
  const user = await requireStaff(roles);
  if (!isStepUpFresh(user.stepUpUntil)) {
    redirect(`/admin/step-up?return_to=${encodeURIComponent(returnTo)}`);
  }
  return user;
}
