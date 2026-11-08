"use client";

import type { ComponentProps } from "react";

import { Field } from "@/components/ui/field";

type CodeFieldProps = Omit<ComponentProps<typeof Field>, "type" | "inputMode" | "pattern" | "maxLength">;

/**
 * A 6-digit authenticator code. Big, spaced digits that are easy to check against the app,
 * paste-friendly (spaces and dashes are dropped), and it submits itself at the sixth digit.
 */
export function CodeField({ onInput, inputClassName, ...props }: CodeFieldProps) {
  return (
    <Field
      {...props}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      title="Enter the 6 digits from your app."
      spellCheck={false}
      inputClassName={`text-center font-mono text-2xl tracking-[0.5em] tabular-nums ${inputClassName ?? ""}`}
      onInput={(event) => {
        const input = event.currentTarget;
        const digits = input.value.replace(/\D/g, "").slice(0, 6);
        if (digits !== input.value) input.value = digits;
        onInput?.(event);
        if (digits.length === 6) input.form?.requestSubmit();
      }}
    />
  );
}
