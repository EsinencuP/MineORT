import Link from "next/link";
import { ProgressBar } from "@/components/portal/cards";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import {
  STATUS_LABEL,
  type ProjectCardData,
  type ProjectStatus,
} from "@/lib/projects/store";

const TONE: Record<ProjectStatus, BadgeTone> = {
  recruiting: "warn",
  in_progress: "info",
  done: "ok",
  cancelled: "neutral",
};
const FALLBACK_COVER: Record<ProjectStatus, string> = {
  recruiting: "/art/meadow.svg",
  in_progress: "/art/house.svg",
  done: "/art/cherry.svg",
  cancelled: "/art/snow.svg",
};

export const coverOf = (p: {
  coverMediaId: string | null;
  status: ProjectStatus;
}) =>
  p.coverMediaId ? `/api/media/${p.coverMediaId}` : FALLBACK_COVER[p.status];

/** A project in the list: cover, title, place, progress, how many helpers. */
export function ProjectListCard({ p }: { p: ProjectCardData }) {
  return (
    <Link
      href={`/social/projects/${p.id}`}
      className="border-line bg-surface hover:bg-brand-50 lift flex h-full flex-col overflow-hidden rounded-2xl border"
    >
      <span className="art-bg block aspect-[16/9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverOf(p)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </span>
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={TONE[p.status]}>
            {STATUS_LABEL[p.status]}
          </StatusBadge>
          {p.openNeeds > 0 && p.status !== "done" && (
            <span className="text-ink-muted text-xs">
              Нужно ещё: {p.openNeeds}
            </span>
          )}
        </span>
        <span className="font-pixel text-xl leading-snug break-words">
          {p.title}
        </span>
        {p.place && (
          <span className="text-ink-muted text-sm break-words">{p.place}</span>
        )}
        <span className="mt-auto flex flex-col gap-2 pt-2">
          <ProgressBar value={p.progress} label={`Готовность ${p.title}`} />
          <span className="text-ink-muted flex justify-between text-xs">
            <span>Автор: {p.authorName}</span>
            <span>Помогают: {p.supporters}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
