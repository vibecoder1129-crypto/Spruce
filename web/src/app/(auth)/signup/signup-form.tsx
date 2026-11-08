"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordField } from "@/components/ui/password-field";
import { api, nextStep, type Me } from "@/lib/api";
import { cn } from "@/lib/cn";

const roles = [
  { value: "consumer", title: "I want to book", text: "Find and book appointments near you." },
  { value: "owner", title: "I run a business", text: "List your venue and manage bookings." },
] as const;

export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<"consumer" | "owner">(
    params.get("as") === "business" ? "owner" : "consumer",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>("/auth/signup", {
        method: "POST",
        body: {
          email: form.get("email"),
          password: form.get("password"),
          role,
          accept_terms: form.get("terms") === "on",
        },
      });
      router.push(nextStep(me));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create an account"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-spruce underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormError message={error} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">What brings you here?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border p-4 transition-[background-color,border-color,box-shadow] duration-200",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-spruce",
                  role === r.value ? "border-spruce bg-mint shadow-[var(--shadow-focus-ring)]" : "border-line-strong bg-surface hover:bg-ground",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-3 font-semibold">
                  {r.title}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      role === r.value ? "border-spruce bg-spruce" : "border-line-strong bg-surface",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full bg-white", role !== r.value && "hidden")} />
                  </span>
                </span>
                <span className="text-sm text-muted">{r.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          hint="At least 12 characters. A short sentence works well."
          required
        />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="terms" required className="mt-0.5 size-5 shrink-0 accent-spruce" />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-spruce underline underline-offset-4">
              Terms
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" className="font-semibold text-spruce underline underline-offset-4">
              Privacy notice
            </Link>
            .
          </span>
        </label>
        {role === "owner" && (
          <p className="rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm text-ink">
            Business accounts use two-step verification. You&apos;ll set it up next, with an
            authenticator app such as Google Authenticator or 1Password.
          </p>
        )}
        <Button type="submit" size="lg" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
