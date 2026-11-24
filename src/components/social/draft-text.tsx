"use client";

import { useEffect, useRef } from "react";

export function DraftText({
  user,
  published,
}: {
  user: string;
  published: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const key = `mineort.post-draft.${user}`;
  useEffect(() => {
    try {
      if (published) sessionStorage.removeItem(key);
      else if (ref.current && !ref.current.value)
        ref.current.value = sessionStorage.getItem(key) ?? "";
    } catch {
      // Storage is optional for browsers running in private mode.
    }
  }, [key, published]);
  return (
    <textarea
      id="post-body"
      name="body"
      required
      maxLength={2000}
      rows={4}
      ref={ref}
      placeholder="Расскажи о постройке, находке или планах"
      onChange={(event) => {
        try {
          sessionStorage.setItem(key, event.target.value);
        } catch {}
      }}
      className="bg-paper text-ink border-line rounded-2xl border px-4 py-3"
    />
  );
}
