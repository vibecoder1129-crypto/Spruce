"use client";

import { useState, type ComponentProps } from "react";

import { Field } from "@/components/ui/field";

type PasswordFieldProps = Omit<
  ComponentProps<typeof Field>,
  "type" | "trailing"
>;

/** A password input with a Show/Hide toggle, so people can check what they typed. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      // Browsers must not offer to autocorrect or capitalise a visible password.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="min-h-11 min-w-11 rounded-[10px] px-3 text-xs font-semibold tracking-[var(--tracking-label)] text-spruce uppercase hover:bg-mint"
        >
          {visible ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      }
    />
  );
}
