"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { api } from "@/lib/api";
import { useFieldErrors } from "@/lib/form-errors";

export function ResetPasswordPage() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { errors, check, clear } = useFieldErrors();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset/confirm", {
        method: "POST",
        body: { token, password: new FormData(event.currentTarget).get("password") },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password changed" intro="You've been logged out everywhere. Log in with your new password.">
        <ButtonLink href="/login" variant="secondary" size="lg" className="w-full">
          Log in
        </ButtonLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          hint="At least 12 characters. A short sentence works well."
          data-missing="Choose a new password."
          error={errors.password}
          onInput={() => clear("password")}
          required
          autoFocus
        />
        <Button type="submit" size="lg" loading={busy}>
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
