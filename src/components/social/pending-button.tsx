"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ButtonVariant } from "@/components/ui/button-styles";

/**
 * Submit button that locks itself while the form is being sent (no double clicks, SC-POLL-02) and
 * swaps its label for `pendingText`. The caller's `disabled` is respected and never overridden.
 */
export function PendingButton({
  children,
  pendingText = "Отправляем…",
  variant = "primary",
  ...rest
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
} & Omit<React.ComponentProps<"button">, "type">) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" variant={variant}>
      {pending ? pendingText : children}
    </Button>
  );
}
