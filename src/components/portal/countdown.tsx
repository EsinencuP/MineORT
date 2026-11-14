"use client";

import { useSyncExternalStore } from "react";

/** Wall clock rounded to the minute: a stable snapshot between ticks. */
const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
};
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverSnapshot = () => null;

/** Time to go, in days/hours/minutes. Rendered after mount so server and client never disagree. */
export function Countdown({ target }: { target: string }) {
  const now = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  if (now === null)
    return (
      <span
        className="inline-block h-6 w-28 animate-pulse rounded bg-[color:var(--line)]"
        aria-hidden="true"
      />
    );
  const ms = Date.parse(target) - now;
  if (ms <= 0) return <span className="font-semibold">Уже идёт</span>;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [
    d > 0 ? `${d} д` : null,
    `${h} ч`,
    d === 0 ? `${m} мин` : null,
  ].filter(Boolean);
  return (
    <span
      className="font-pixel text-lg"
      aria-label={`До начала: ${parts.join(" ")}`}
    >
      {parts.join(" ")}
    </span>
  );
}
