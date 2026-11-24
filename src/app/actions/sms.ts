"use server";

import { notFound, redirect } from "next/navigation";
import {
  sendSms,
  smsContact,
  smsEnabled,
  smsMessage,
} from "@/lib/community/sms";
import { SocialError } from "@/lib/social/errors";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

const BACK = "/dashboard/messages";

async function actor() {
  if (!smsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  if (!viewer.canPublish) notFound();
  return viewer.userId;
}

export async function sendSmsAction(form: FormData) {
  const userId = await actor();
  const to = String(form.get("to") ?? "").trim();
  let result: string;
  try {
    await sendSms(userId, to, form.get("body"), form.get("operation"), "site");
    result = `ok=sent&with=${encodeURIComponent(to)}`;
  } catch (error) {
    if (!(error instanceof SocialError)) throw error;
    result = `error=${encodeURIComponent(error.code)}`;
  }
  redirect(`${BACK}?${result}`);
}

export async function setSmsModeAction(form: FormData) {
  const userId = await actor();
  const mode = String(form.get("mode"));
  if (!["all", "limited", "none"].includes(mode)) return;
  const { error } = await db()
    .from("sms_preferences")
    .upsert({ user_id: userId, receive_mode: mode });
  if (error) throw new Error(`sms preferences: ${error.message}`);
  redirect(`${BACK}?ok=saved`);
}

export async function setSmsContactAction(form: FormData) {
  const userId = await actor();
  const contact = await smsContact(String(form.get("nick") ?? "").trim());
  const relation = form.get("relation");
  if (
    !contact ||
    contact === userId ||
    (relation !== "allow" && relation !== "block")
  )
    redirect(`${BACK}?error=sms_unavailable`);
  const table = db().from("sms_contacts");
  const { error } = form.has("remove")
    ? await table
        .delete()
        .eq("owner_id", userId)
        .eq("contact_id", contact)
        .eq("relation", relation)
    : await table.upsert({ owner_id: userId, contact_id: contact, relation });
  if (error) throw new Error(`sms contact: ${error.message}`);
  redirect(`${BACK}?ok=saved`);
}

export async function reportSmsAction(form: FormData) {
  const userId = await actor();
  const message = await smsMessage(userId, String(form.get("message")));
  if (!message || message.recipient_id !== userId) notFound();
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  if (reason.length < 3) redirect(`${BACK}?error=reason_too_short`);
  const { error } = await db().from("moderation_reports").insert({
    reporter_id: userId,
    target_type: "sms",
    target_id: message.id,
    reason,
  });
  if (error?.code === "23505") redirect(`${BACK}?error=report_duplicate`);
  if (error) throw new Error(`sms report: ${error.message}`);
  redirect(`${BACK}?ok=reported`);
}
