import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`border-line bg-surface rounded-[1.25rem] border p-4 shadow-[var(--shadow-card)] sm:p-6 ${className}`}
      {...props}
    />
  );
}
