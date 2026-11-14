"use server";

import { redirect } from "next/navigation";
import {
  AccessError,
  acceptRules,
  currentRules,
  hasAcceptedCurrentRules,
  redeemInvitation,
  reserveNickname,
  submitApplication,
  withdrawApplication,
} from "@/lib/access/store";
import { getCurrentUser } from "@/lib/auth/current-user";
import { onMembershipApproved } from "@/lib/bridge/whitelist";
import { safeReturnTo } from "@/lib/auth/session-policy";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

/**
 * The rules checkbox in the access forms: if the current rules are not accepted yet, the box must be
 * ticked, and ticking it records the acceptance in the same step.
 */
async function ensureRulesAccepted(userId: string, formData: FormData) {
  if (await hasAcceptedCurrentRules(userId)) return;
  if (formData.get("rules") !== "on") throw new AccessError("rules_required");
  const current = await currentRules();
  if (!current) throw new AccessError("rules_required");
  await acceptRules(userId, current.id);
}

/** Runs a mutation as the signed-in user; always ends in a redirect with ?error=code or ?ok=1. */
async function run(
  formData: FormData,
  fallbackPath: string,
  okKey: string,
  fn: (userId: string) => Promise<unknown>,
): Promise<never> {
  const back = safeReturnTo(str(formData.get("return_to")) || fallbackPath);
  const user = await getCurrentUser();
  if (!user)
    redirect(`/api/auth/telegram/start?return_to=${encodeURIComponent(back)}`);
  let error: string | null = null;
  try {
    await fn(user.userId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    error = e.code;
  }
  const url = new URL(back, "http://x");
  url.searchParams.set(error ? "error" : "ok", error ?? okKey);
  redirect(url.pathname + url.search);
}

export async function acceptRulesAction(formData: FormData) {
  return run(formData, "/rules", "rules", (uid) =>
    acceptRules(uid, str(formData.get("version_id"))),
  );
}

export async function reserveNickAction(formData: FormData) {
  return run(formData, "/onboarding/minecraft", "nick", (uid) =>
    reserveNickname(uid, str(formData.get("nick"))),
  );
}

export async function redeemInvitationAction(formData: FormData) {
  return run(formData, "/onboarding/minecraft", "invite", async (uid) => {
    await ensureRulesAccepted(uid, formData);
    await redeemInvitation(uid, str(formData.get("token")));
    // The membership is already saved; if queuing fails, reconciliation re-queues it.
    await onMembershipApproved(uid).catch(() => undefined);
  });
}

export async function submitApplicationAction(formData: FormData) {
  // The short form: why, and (optionally) who invited. An older single "text" field still works.
  const why = str(formData.get("why"));
  const from = str(formData.get("referrer"));
  const text =
    [
      why && `Почему хочу присоединиться: ${why}`,
      from && `Откуда узнал: ${from}`,
    ]
      .filter(Boolean)
      .join("\n") || str(formData.get("text"));
  return run(formData, "/onboarding/minecraft", "applied", async (uid) => {
    await ensureRulesAccepted(uid, formData);
    await submitApplication(uid, text.slice(0, 1000) || null);
  });
}

export async function withdrawApplicationAction(formData: FormData) {
  return run(formData, "/onboarding/minecraft", "withdrawn", (uid) =>
    withdrawApplication(uid),
  );
}
