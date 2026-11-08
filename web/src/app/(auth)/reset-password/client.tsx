"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { api } from "@/lib/api";

export function ResetPasswordPage() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        <Link href="/login" className="font-semibold text-spruce underline underline-offset-4">
          Log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          hint="At least 12 characters."
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
