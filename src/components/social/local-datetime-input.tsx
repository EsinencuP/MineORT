"use client";

import { useId, useState } from "react";

/**
 * Date and time typed in the browser's own zone. The form carries the moment as ISO UTC
 * (`starts_at`) and the zone name (`tz`), so the server stores UTC and never guesses a zone.
 */
export function LocalDateTimeInput({
  label,
  name = "starts_at",
  withZone = true,
}: {
  label: string;
  name?: string;
  withZone?: boolean;
}) {
  const id = useId();
  const [iso, setIso] = useState("");
  const [tz, setTz] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        required
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : null;
          setIso(d && !Number.isNaN(d.getTime()) ? d.toISOString() : "");
          setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
        }}
        className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3"
      />
      <input type="hidden" name={name} value={iso} />
      {withZone && <input type="hidden" name="tz" value={tz} />}
      <p className="text-ink-muted text-xs">Время в вашем часовом поясе.</p>
    </div>
  );
}
