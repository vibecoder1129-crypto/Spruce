"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { api, nextStep, type Me } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      router.push(nextStep(me));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Log in"
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-spruce underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" size="lg" loading={busy}>
          Log in
        </Button>
        <Link
          href="/forgot-password"
          className="self-center text-sm font-semibold text-spruce underline underline-offset-4"
        >
          Forgot your password?
        </Link>
      </form>
    </AuthShell>
  );
}
