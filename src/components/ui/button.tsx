import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Pill buttons, as in the reference: solid grass-green primary, outlined secondary.
const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-on-brand shadow-sm hover:brightness-110",
  secondary:
    "border-2 border-brand-500 bg-transparent text-brand-700 hover:bg-brand-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "bg-danger text-on-danger shadow-sm hover:opacity-90",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** Round icon-only button (arrows, play), 48 px touch target. */
export const circleClass =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-brand-500/60 bg-paper text-ink shadow-sm transition-colors hover:bg-brand-50";
