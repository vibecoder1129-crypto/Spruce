import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/cn";

type SelectProps = ComponentProps<"select"> & { label: string; hint?: string; error?: string };

/** A labelled native select: keyboard, screen reader and mobile pickers work for free. */
export function Select({ label, hint, error, id, className, children, required, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={selectId} className="text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="text-muted font-normal">
            {" "}
            <span aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <div className="relative">
        <select
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          "min-h-12 w-full appearance-none rounded-[var(--radius-control)] border bg-surface",
          error ? "border-danger" : "border-line-strong",
          "pl-4 pr-10 text-base text-ink",
          "transition-[border-color,box-shadow] duration-200 hover:border-muted",
          "focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]",
        )}
        {...rest}
      >
        {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className="pointer-events-none absolute top-1/2 right-4 h-2 w-3 -translate-y-1/2 text-muted"
        >
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
