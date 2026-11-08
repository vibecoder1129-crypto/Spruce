"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password-reset", {
        method: "POST",
        body: { email: new FormData(event.currentTarget).get("email") },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        intro="If an account uses that address, we've sent a link to reset the password. It works for 1 hour."
      >
        <Link href="/login" className="font-semibold text-spruce underline underline-offset-4">
          Back to log in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" intro="Enter your email and we'll send you a reset link.">
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <Field label="Email" name="email" type="email" autoComplete="email" required autoFocus />
        <Button type="submit" size="lg" loading={busy}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
