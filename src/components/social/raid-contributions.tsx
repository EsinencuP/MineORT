import Link from "next/link";
import { raidContributionAction } from "@/app/actions/raids";
import { Card } from "@/components/ui/card";
import { progressEnabled } from "@/lib/community/progress";
import type { EventView } from "@/lib/social/events";
import { authorsOf } from "@/lib/social/store";
import type { Viewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";
import { PendingButton } from "./pending-button";

const INPUT =
  "border-line bg-paper min-h-11 min-w-0 rounded-xl border px-3 text-sm";

export async function RaidContributions({
  event,
  viewer,
}: {
  event: EventView;
  viewer: Viewer;
}) {
  if (!event.projectId || !viewer.userId || !progressEnabled()) return null;
  const organizer = event.organizerId === viewer.userId;
  const project = await db()
    .from("projects")
    .select("title")
    .eq("id", event.projectId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (project.error) throw new Error(`raid project: ${project.error.message}`);
  if (!project.data) return null;
  let entries = db()
    .from("event_contributions")
    .select("user_id,need_id,planned,confirmed")
    .eq("event_id", event.id);
  if (!organizer) entries = entries.eq("user_id", viewer.userId);
  const [needs, contributions] = await Promise.all([
    db()
      .from("project_needs")
      .select("id,title,unit,done")
      .eq("project_id", event.projectId)
      .order("position"),
    entries.limit(500),
  ]);
  if (needs.error || contributions.error)
    throw new Error("raid contribution lookup failed");
  const members = organizer
    ? await authorsOf([...new Set(contributions.data.map((r) => r.user_id))])
    : null;
  const before = !event.started;
  const remaining = needs.data.filter((need) => !need.done);
  const byNeed = new Map(needs.data.map((need) => [need.id, need]));
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-pixel text-xl">Проектный рейд</h2>
      <Link
        href={`/social/projects/${event.projectId}`}
        className="text-brand-700 text-sm underline"
      >
        {project.data.title}
      </Link>
      {viewer.canPublish &&
        event.joined &&
        before &&
        !event.cancelled &&
        remaining.length > 0 && (
          <form
            action={raidContributionAction}
            className="flex flex-wrap gap-2"
          >
            <input type="hidden" name="event_id" value={event.id} />
            <select name="need" aria-label="Что принесёте" className={INPUT}>
              {remaining.map((need) => (
                <option key={need.id} value={need.id}>
                  {need.title}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="quantity"
              required
              min={1}
              max={100000}
              aria-label="Количество"
              className={`${INPUT} w-28`}
            />
            <PendingButton>Записать вклад</PendingButton>
          </form>
        )}
      {contributions.data.map((r) => {
        const need = byNeed.get(r.need_id);
        if (!need) return null;
        return (
          <div
            key={`${r.user_id}:${r.need_id}`}
            className="border-line flex flex-col gap-2 border-t pt-2 text-sm"
          >
            <p>
              {members?.get(r.user_id)?.name ?? "Ваш вклад"} · {need.title} ·{" "}
              {r.confirmed ?? r.planned} {need.unit}
              {" · "}
              {r.confirmed ? "подтверждён" : "запланирован"}
            </p>
            {organizer &&
              viewer.canPublish &&
              !before &&
              !event.cancelled &&
              !r.confirmed && (
                <form
                  action={raidContributionAction}
                  className="flex flex-wrap gap-2"
                >
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="need" value={r.need_id} />
                  <input type="hidden" name="player" value={r.user_id} />
                  <input type="hidden" name="mode" value="confirm" />
                  <input
                    type="number"
                    name="quantity"
                    required
                    min={1}
                    max={100000}
                    defaultValue={r.planned}
                    aria-label="Фактический вклад"
                    className={`${INPUT} w-28`}
                  />
                  <PendingButton>Подтвердить вклад</PendingButton>
                </form>
              )}
          </div>
        );
      })}
    </Card>
  );
}
