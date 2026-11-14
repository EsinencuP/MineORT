"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/button";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Submit button that locks itself while the form is being sent (no double clicks, SC-POLL-02). */
export function PendingButton({
  children,
  pendingText = "Отправляем…",
  variant = "primary",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: Variant;
  className?: string;
} & Omit<React.ComponentProps<"button">, "type" | "className">) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={buttonClass(variant, className)}
      {...rest}
    >
      {pending ? pendingText : children}
    </button>
  );
}
