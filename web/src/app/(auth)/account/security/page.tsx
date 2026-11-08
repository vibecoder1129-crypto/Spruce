"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, ApiError, nextStep, type Me } from "@/lib/api";

type Setup = { secret: string; otpauth_uri: string };

export default function SecuritySetupPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string>("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api<Setup>("/auth/mfa/setup", { method: "POST" })
      .then(async (s) => {
        setSetup(s);
        setQr(await QRCode.toString(s.otpauth_uri, { type: "svg", margin: 1, color: { dark: "#15201A", light: "#FFFFFF" } }));
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else if (e instanceof ApiError && e.status === 409) router.replace("/account");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
      const res = await api<{ recovery_codes: string[] }>("/auth/mfa/enable", { method: "POST", body: { code } });
      setCodes(res.recovery_codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (codes) {
    const text = codes.join("\n");
    return (
      <AuthShell
        title="Save your recovery codes"
        intro="If you lose your phone, each code lets you in once. Keep them somewhere safe, like a password manager. You won't see them again."
      >
        <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] bg-ground p-4 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text)}>
            Copy codes
          </Button>
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-xs font-semibold uppercase tracking-[var(--tracking-label)] hover:bg-mint"
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="recovery-codes.txt"
          >
            Download
          </a>
        </div>
        <Button size="lg" onClick={async () => router.push(nextStep(await api<Me>("/me")))}>
          I&apos;ve saved them
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={"Turn on two\u2011step verification"}
      intro="Scan the code with an authenticator app, such as Google Authenticator or 1Password, then enter the 6-digit code it shows."
    >
      <FormError message={error} />
      {setup ? (
        <>
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            className="mx-auto size-48 rounded-[var(--radius-control)] border border-line p-2 [&_svg]:size-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-spruce">
              Can&apos;t scan? Enter the key by hand
            </summary>
            <p className="mt-2 break-all rounded-[var(--radius-control)] bg-ground p-3 font-mono">{setup.secret}</p>
          </details>
          <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field
              label="6-digit code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
            <Button type="submit" size="lg" loading={busy}>
              Turn on
            </Button>
          </form>
        </>
      ) : (
        !error && <p className="text-muted">Preparing your code…</p>
      )}
    </AuthShell>
  );
}
