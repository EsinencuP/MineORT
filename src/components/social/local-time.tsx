"use client";

import { useSyncExternalStore } from "react";

const COMMUNITY_TZ = "Europe/Chisinau";
const subscribe = () => () => {};
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function utcLabel(d: Date, tz: string) {
  const part = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return (part ?? "GMT").replace("GMT", "UTC") || "UTC";
}

/**
 * Event time as the viewer's browser sees it, with the offset spelled out; the UTC value is in the
 * tooltip. Until the browser zone is known (server render) it shows the community time.
 */
export function LocalTime({
  iso,
  className = "",
}: {
  iso: string;
  className?: string;
}) {
  const browserTz = useSyncExternalStore(subscribe, zone, () => null);
  const tz = browserTz ?? COMMUNITY_TZ;
  const d = new Date(iso);
  const text = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
  const label = browserTz
    ? `ваше время, ${utcLabel(d, tz)}`
    : `время сообщества, ${utcLabel(d, tz)}`;
  return (
    <time
      dateTime={iso}
      title={`${d.toISOString().replace("T", " ").slice(0, 16)} UTC`}
      className={className}
      suppressHydrationWarning
    >
      {text} <span className="text-ink-muted">({label})</span>
    </time>
  );
}
