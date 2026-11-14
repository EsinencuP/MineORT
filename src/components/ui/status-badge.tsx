export type BadgeTone = "ok" | "warn" | "danger" | "info" | "neutral";

const tones: Record<BadgeTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  neutral: "bg-surface text-ink-muted border border-line",
};

const marks: Record<BadgeTone, string> = {
  ok: "✓",
  warn: "!",
  danger: "✕",
  info: "i",
  neutral: "•",
};

/** Status is never colour-only: every tone carries a text mark. */
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${tones[tone]}`}
    >
      <span aria-hidden="true">{marks[tone]}</span>
      {children}
    </span>
  );
}
