import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass, type ButtonVariant } from "./button-styles";

// Server-safe pieces live here; the interactive Button (it reads the form status) is a client component.
export { Button } from "./button-client";
export { buttonClass, circleClass } from "./button-styles";

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
