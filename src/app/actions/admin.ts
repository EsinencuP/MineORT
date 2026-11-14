"use server";

import { redirect } from "next/navigation";
import {
  AccessError,
  createInvitation,
  decideApplication,
  publishRules,
  revokeInvitation,
} from "@/lib/access/store";
import { requireStaff } from "@/lib/auth/guards";
import { onMembershipApproved } from "@/lib/bridge/whitelist";
import { db } from "@/lib/supabase-admin";
import { messageFor } from "@/lib/access/messages";

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

async function staffRun(
  roles: ("moderator" | "admin")[],
  path: string,
  fn: (actorId: string) => Promise<unknown>,
): Promise<never> {
  const user = await requireStaff(roles); // re-checked on every call: actions are reachable by direct POST
  let error: string | null = null;
  try {
    await fn(user.userId);
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    error = e.code;
  }
  redirect(error ? `${path}?error=${error}` : `${path}?ok=1`);
}

export async function publishRulesAction(formData: FormData) {
  const major = Number.parseInt(str(formData.get("major")), 10);
  const minor = Number.parseInt(str(formData.get("minor")), 10);
  const body = str(formData.get("body"));
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    major < 0 ||
    minor < 0 ||
    !body
  ) {
    redirect("/admin/rules?error=bad_input");
  }
  return staffRun(["admin"], "/admin/rules", (id) =>
    publishRules(id, major, minor, body),
  );
}

export type CreateInvitationState = { token?: string; error?: string } | null;

/** Returns the one-time token to the form (never put in a URL or stored). */
export async function createInvitationAction(
  _prev: CreateInvitationState,
  _formData: FormData,
): Promise<CreateInvitationState> {
  const user = await requireStaff(["admin"]);
  try {
    const { token } = await createInvitation(user.userId, 1);
    return { token };
  } catch (e) {
    if (e instanceof AccessError)
      return { error: messageFor(e.code) ?? undefined };
    throw e;
  }
}

export async function revokeInvitationAction(formData: FormData) {
  return staffRun(["admin"], "/admin/invitations", (id) =>
    revokeInvitation(id, str(formData.get("invitation_id"))),
  );
}

export async function decideApplicationAction(formData: FormData) {
  const decision = str(formData.get("decision"));
  if (decision !== "approve" && decision !== "reject")
    redirect("/admin/applications?error=bad_decision");
  const applicationId = str(formData.get("application_id"));
  return staffRun(["moderator", "admin"], "/admin/applications", async (id) => {
    await decideApplication(
      id,
      applicationId,
      decision,
      str(formData.get("reason")) || null,
    );
    if (decision === "approve") {
      const { data } = await db()
        .from("applications")
        .select("user_id")
        .eq("id", applicationId)
        .single();
      // The decision is already saved; if queuing fails, reconciliation re-queues it.
      if (data) await onMembershipApproved(data.user_id).catch(() => undefined);
    }
  });
}
