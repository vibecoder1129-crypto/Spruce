import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2.5 rounded-[var(--radius-button)] font-bold uppercase " +
  "tracking-[var(--tracking-label)] transition-[background-color,border-color,color,transform,box-shadow] " +
  "duration-200 ease-[var(--ease-out)] active:scale-[0.98] disabled:cursor-not-allowed " +
  "disabled:bg-none disabled:bg-line disabled:text-muted disabled:border-line disabled:shadow-none disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "bg-spruce bg-linear-to-b from-spruce to-spruce-hover/90 text-white shadow-[var(--shadow-button)] " +
    "hover:from-spruce-hover hover:to-spruce-hover",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-spruce/40 hover:bg-mint",
  ghost: "text-spruce hover:bg-mint",
  danger: "bg-danger text-white hover:brightness-90",
};

// Both sizes keep a 44px minimum target (WCAG 2.5.5).
const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-xs",
  lg: "min-h-[54px] px-6 text-sm",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  extra?: string,
) {
  return cn(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, disables the button and tells screen readers it is busy. */
  loading?: boolean;
};

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
};

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
