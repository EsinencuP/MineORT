"use client";

import { useState } from "react";

/** Copies text to the clipboard and confirms with a short "Скопировано" state. */
export function CopyButton({
  text,
  label = "Скопировать IP",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* clipboard blocked: the address stays visible and selectable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`bg-brand-600 text-on-brand inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition hover:brightness-110 ${className}`}
    >
      <span aria-live="polite">{done ? "Скопировано ✓" : label}</span>
    </button>
  );
}
