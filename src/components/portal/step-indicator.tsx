export type StepState = "done" | "current" | "todo";

/** Horizontal progress (Telegram ✓ → Minecraft → Доступ). On phones only the current step keeps its visible label (the others stay in the accessibility tree). */
export function StepIndicator({
  steps,
}: {
  steps: { label: string; state: StepState }[];
}) {
  return (
    <ol
      className="flex items-center gap-2 sm:gap-3"
      aria-label="Шаги регистрации"
    >
      {steps.map((s, i) => (
        <li
          key={s.label}
          className="flex flex-1 items-center gap-2 last:flex-none sm:gap-3"
          aria-current={s.state === "current" ? "step" : undefined}
        >
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${
              s.state === "done"
                ? "border-brand-600 bg-brand-600 text-on-brand"
                : s.state === "current"
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line text-ink-muted"
            }`}
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span
            className={`text-xs font-semibold sm:text-sm ${s.state === "todo" ? "text-ink-muted" : "text-ink"} ${s.state === "current" ? "" : "sr-only sm:not-sr-only"}`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={`h-0.5 flex-1 rounded ${s.state === "done" ? "bg-brand-600" : "bg-line"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
