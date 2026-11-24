"use server";

import { notFound, redirect } from "next/navigation";
import { progressEnabled } from "@/lib/community/progress";
import { calendarEnabled, EVENT_ID, eventPath } from "@/lib/social/events";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

export async function raidContributionAction(form: FormData) {
  if (!progressEnabled() || !calendarEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId || !viewer.canPublish) notFound();
  const id = String(form.get("event_id") ?? "");
  const need = String(form.get("need") ?? "");
  const player = String(form.get("player") || viewer.userId);
  const qty = Number(form.get("quantity"));
  if (!EVENT_ID.test(id) || !EVENT_ID.test(need) || !EVENT_ID.test(player))
    notFound();
  const back = eventPath(id);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100_000)
    redirect(`${back}?error=event_invalid`);
  const { error } = await db().rpc("raid_contribution", {
    p_user: viewer.userId,
    p_event: id,
    p_player: player,
    p_need: need,
    p_quantity: qty,
    p_confirm: form.get("mode") === "confirm",
  });
  if (error?.code === "P0001")
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  if (error) throw new Error(`record raid contribution: ${error.message}`);
  redirect(`${back}?ok=contribution`);
}
