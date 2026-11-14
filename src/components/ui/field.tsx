import { useId, type ComponentProps } from "react";

export function Field({
  label,
  hint,
  error,
  className = "",
  ...props
}: ComponentProps<"input"> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`border-line bg-paper text-ink min-h-11 rounded-lg border px-3 py-2 text-base ${error ? "border-danger" : ""} ${className}`}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-ink-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
