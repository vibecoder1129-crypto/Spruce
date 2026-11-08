"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, nextStep, type Me } from "@/lib/api";

export function VerifyForm() {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).trim();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/mfa/verify", {
        method: "POST",
        body: { code },
      });
      router.push(nextStep(me));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
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
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        {recovery ? (
          <Field
            key="recovery"
            label="Recovery code"
            name="code"
            autoComplete="off"
            required
            autoFocus
            placeholder="xxxxxxxx-xxxxxxxx"
          />
        ) : (
          <Field
            key="totp"
            label="6-digit code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
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
          }}
          className="min-h-11 self-center text-sm font-semibold text-spruce underline underline-offset-4"
        >
          {recovery
            ? "Use my authenticator app instead"
            : "Lost your phone? Use a recovery code"}
        </button>
      </form>
    </AuthShell>
  );
}
