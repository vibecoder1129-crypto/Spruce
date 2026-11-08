import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type FieldProps = ComponentProps<"input"> & {
  label: string;
  hint?: string;
  error?: string;
  /** A functional control inside the input's end, such as a show-password toggle. */
  trailing?: ReactNode;
  inputClassName?: string;
};

/**
 * A labelled text input. The label, hint and error are wired to the input with
 * aria attributes, so assistive tech reads them in order.
 */
export function Field({ label, hint, error, trailing, id, className, inputClassName, required, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
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
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(hintId, errorId) || undefined}
          className={cn(
            "min-h-12 w-full rounded-[var(--radius-control)] border bg-surface px-4 text-base text-ink",
            "transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70",
            "focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]",
            trailing != null && "pr-24",
            error ? "border-danger" : "border-line-strong hover:border-muted",
            inputClassName,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
