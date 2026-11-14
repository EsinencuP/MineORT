import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`border-line bg-surface rounded-(--radius-card) border p-4 sm:p-6 ${className}`}
      {...props}
    />
  );
}
