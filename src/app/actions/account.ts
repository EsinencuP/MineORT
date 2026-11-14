"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/access/store";
import { deleteAccount } from "@/lib/admin/players";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SESSION_COOKIE, isFreshLogin } from "@/lib/auth/session-policy";

/**
 * Self-service account deletion. Needs a Telegram sign-in not older than 5 minutes (each sign-in
 * creates a new session, so the session age is the sign-in age). Banned or suspended accounts are
 * refused by the database, so deleting the account cannot be used to dodge a sanction.
 */
export async function deleteOwnAccountAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/telegram/start?return_to=/dashboard/delete");
  if (formData.get("confirm") !== "on")
    redirect("/dashboard/delete?error=confirm_required");
  if (!isFreshLogin(user.createdAt)) {
    redirect("/api/auth/telegram/start?return_to=/dashboard/delete");
  }
  try {
    await deleteAccount(user.userId, user.userId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    redirect(`/dashboard/delete?error=${e.code}`);
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?ok=deleted");
}
