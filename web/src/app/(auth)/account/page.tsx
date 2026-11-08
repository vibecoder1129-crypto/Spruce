"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, ApiError, nextStep, type Me } from "@/lib/api";

const roleLabel = { consumer: "Customer", owner: "Business owner", staff: "Team member", admin: "Platform admin" };

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/me")
      .then((m) => (m.mfa_pending ? router.replace(nextStep(m)) : setMe(m)))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [router]);

  async function run(path: string, then: () => void) {
    setError(null);
    try {
      await api(path, { method: "POST" });
      then();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  if (!me) {
    return (
      <AuthShell title="Your account">
        <FormError message={error} />
        {!error && <p className="text-muted">Loading…</p>}
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Your account">
      <FormError message={error} />
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">Email</dt>
          <dd className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="break-all">{me.email}</span>
            {me.email_verified ? <Badge tone="spruce">Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">Account type</dt>
          <dd className="font-semibold">{roleLabel[me.role]}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">Two-step verification</dt>
          <dd className="font-semibold">{me.mfa_enabled ? "On" : "Off"}</dd>
        </div>
      </dl>
      {!me.email_verified && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-warn-soft p-4">
          <p className="text-sm">We sent a confirmation link to your email. It works for 48 hours.</p>
          <Button variant="secondary" onClick={() => run("/auth/verify-email/resend", () => setNotice("We've sent a new link."))}>
            Send a new link
          </Button>
        </div>
      )}
      <p aria-live="polite" className="text-sm text-spruce empty:hidden">
        {notice}
      </p>
      {!me.mfa_enabled && (
        <ButtonLink href="/account/security" variant="secondary">
          Turn on two-step verification
        </ButtonLink>
      )}
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row">
        <Button variant="secondary" onClick={() => run("/auth/logout", () => router.push("/login"))}>
          Log out
        </Button>
        <Button variant="ghost" onClick={() => run("/auth/logout-everywhere", () => router.push("/login"))}>
          Log out on all devices
        </Button>
      </div>
    </AuthShell>
  );
}
