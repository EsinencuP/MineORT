"use server";

import { redirect } from "next/navigation";
import { confirmTotp, stepUp } from "@/lib/admin/store";
import { deleteAccount, setAccountStatus } from "@/lib/admin/players";
import { AccessError } from "@/lib/access/store";
import { requireStaff, requireStepUp } from "@/lib/auth/guards";
import { safeReturnTo } from "@/lib/auth/session-policy";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First valid code confirms the authenticator; until then the admin area stays closed. */
export async function confirmTotpAction(formData: FormData) {
  const user = await requireStaff(undefined, { allowWithoutTotp: true });
  const result = await confirmTotp(user.userId, str(formData.get("code")));
  redirect(
    result === "ok"
      ? "/admin/security?ok=1"
      : `/admin/security?error=totp_${result}`,
  );
}

/** Opens a 15-minute step-up window for critical operations. */
export async function stepUpAction(formData: FormData) {
  const user = await requireStaff();
  const back = safeReturnTo(str(formData.get("return_to")) || "/admin");
  const result = await stepUp(
    user.userId,
    user.sessionId,
    str(formData.get("code")),
  );
  if (result !== "ok")
    redirect(
      `/admin/step-up?error=totp_${result}&return_to=${encodeURIComponent(back)}`,
    );
  redirect(back);
}

/** suspend | ban | unban; needs a fresh step-up, re-checked on every call (actions can be POSTed directly). */
export async function setStatusAction(formData: FormData) {
  const id = str(formData.get("user_id"));
  if (!UUID.test(id)) redirect("/admin/players");
  const path = `/admin/players/${id}`;
  const actor = await requireStepUp(path);
  const action = str(formData.get("action"));
  if (action !== "suspend" && action !== "ban" && action !== "unban")
    redirect(`${path}?error=bad_action`);
  const days = Number.parseInt(str(formData.get("days")), 10);
  const until =
    action === "ban" && Number.isInteger(days) && days > 0
      ? new Date(Date.now() + days * 86_400_000)
      : null;
  let error: string | null = null;
  try {
    await setAccountStatus(
      actor.userId,
      id,
      action,
      str(formData.get("reason")) || null,
      until,
    );
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    error = e.code;
  }
  redirect(error ? `${path}?error=${error}` : `${path}?ok=${action}`);
}

export async function adminDeleteAction(formData: FormData) {
  const id = str(formData.get("user_id"));
  if (!UUID.test(id)) redirect("/admin/players");
  const path = `/admin/players/${id}`;
  const actor = await requireStepUp(path);
  let error: string | null = null;
  try {
    await deleteAccount(actor.userId, id);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    error = e.code;
  }
  redirect(error ? `${path}?error=${error}` : `${path}?ok=deleted`);
}
