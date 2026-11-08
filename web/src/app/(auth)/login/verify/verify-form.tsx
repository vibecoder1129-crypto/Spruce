"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Field } from "@/components/ui/field";
import { api, nextStep, type Me } from "@/lib/api";
import { useFieldErrors } from "@/lib/form-errors";

export function VerifyForm() {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { errors, check, clear } = useFieldErrors();
  const codeRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/mfa/verify", { method: "POST", body: { code } });
      router.push(nextStep(me));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
      // A wrong code can't be fixed by editing it: clear it, ready for the next one.
      if (codeRef.current) {
        codeRef.current.value = "";
        codeRef.current.focus();
      }
    }
  }

  return (
    <AuthShell
      title="Two-step verification"
      intro={
        recovery
          ? "Enter one of the recovery codes you saved when you set up two-step verification."
          : "Open your authenticator app and enter the 6-digit code for your account."
      }
    >
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        {recovery ? (
          <Field
            key="recovery"
            ref={codeRef}
            label="Recovery code"
            name="code"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="xxxxxxxx-xxxxxxxx"
            data-missing="Enter one of your recovery codes."
            error={errors.code}
            onInput={() => clear("code")}
            inputClassName="font-mono"
            required
            autoFocus
          />
        ) : (
          <CodeField
            key="totp"
            ref={codeRef}
            label="6-digit code"
            name="code"
            data-missing="Enter the 6-digit code from your app."
            error={errors.code}
            onInput={() => clear("code")}
            required
            autoFocus
          />
        )}
        <Button type="submit" size="lg" loading={busy}>
          Verify
        </Button>
        <button
          type="button"
          onClick={() => {
            setRecovery(!recovery);
            setError(null);
            clear("code");
          }}
          className="min-h-11 self-center text-sm font-semibold text-spruce underline underline-offset-4"
        >
          {recovery ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
        </button>
      </form>
    </AuthShell>
  );
}
