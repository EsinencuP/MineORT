"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "./button-styles";

/** Small ring shown while a request is in flight (a static ring when motion is reduced). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin ${className}`}
    />
  );
}

/**
 * Button. A submit button locks itself and shows a ring while its form is being sent, so a second
 * click can never send the form twice. `disabled` from the caller is kept; it never gets overridden.
 */
export function Button({
  variant = "primary",
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  const { pending } = useFormStatus();
  const busy = pending && type === "submit";
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, className)}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}
