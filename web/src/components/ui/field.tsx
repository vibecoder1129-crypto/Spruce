import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/cn";

type FieldProps = ComponentProps<"input"> & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * A labelled text input. The label, hint and error are wired to the input with
 * aria attributes, so assistive tech reads them in order.
 */
export function Field({ label, hint, error, id, className, required, ...rest }: FieldProps) {
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
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hintId, errorId) || undefined}
        className={cn(
          "min-h-12 rounded-[var(--radius-control)] border bg-surface px-4 text-base text-ink",
          "placeholder:text-muted/70",
          error ? "border-danger" : "border-line-strong hover:border-muted",
        )}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
