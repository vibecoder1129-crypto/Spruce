"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/password-field";
import { api, ApiError } from "@/lib/api";

type Preview = { business_name: string; display_name: string };

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>(`/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setGone(true);
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: {
          password: form.get("password"),
          accept_terms: form.get("terms") === "on",
        },
      });
      router.push("/staff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  }

  if (gone) {
    return (
      <AuthShell
        title="This invite has expired"
        intro="It was already used, replaced by a newer one, or is over 7 days old."
      >
        <p className="text-muted">
          Ask your manager to send a new invite, or{" "}
          <Link href="/login" className="font-semibold text-spruce underline underline-offset-4">
            log in
          </Link>{" "}
          if you already set a password.
        </p>
      </AuthShell>
    );
  }

  if (!preview) {
    return (
      <AuthShell title="Join your team">
        <FormError message={error} />
        {!error && <p className="text-muted">Checking your invite…</p>}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${preview.business_name} on Spruce`}
      intro={`Hi ${preview.display_name}. Choose a password to sign in to your team page.`}
    >
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          hint="At least 12 characters."
          required
          autoFocus
        />
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="terms" required className="mt-0.5 size-5 shrink-0 accent-spruce" />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-spruce underline underline-offset-4">
              terms
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" className="font-semibold text-spruce underline underline-offset-4">
              privacy notice
            </Link>
            .
          </span>
        </label>
        <Button type="submit" size="lg" loading={busy}>
          Join the team
        </Button>
      </form>
    </AuthShell>
  );
}
