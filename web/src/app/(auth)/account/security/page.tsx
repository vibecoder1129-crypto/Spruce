"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AuthShell, FormError } from "@/components/auth-shell";
import { Button, buttonClasses } from "@/components/ui/button";
import { CodeField } from "@/components/ui/code-field";
import { Icon } from "@/components/icons";
import { api, ApiError, nextStep, type Me } from "@/lib/api";
import { useFieldErrors } from "@/lib/form-errors";

type Setup = { secret: string; otpauth_uri: string };

export default function SecuritySetupPage() {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [qr, setQr] = useState<string>("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"codes" | "key" | null>(null);
  const { errors, check, clear } = useFieldErrors();
  const codeRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  async function copy(what: "codes" | "key", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it yourself.");
    }
  }

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
    if (busy || !check(event.currentTarget)) return;
    setBusy(true);
    setError(null);
    try {
      const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
      const res = await api<{ recovery_codes: string[] }>("/auth/mfa/enable", { method: "POST", body: { code } });
      setCodes(res.recovery_codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      if (codeRef.current) {
        codeRef.current.value = "";
        codeRef.current.focus();
      }
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
        <div className="flex flex-col gap-6">
          <FormError message={error} />
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]">
            <ol
              aria-label="Recovery codes"
              className="grid grid-cols-1 gap-x-6 gap-y-2.5 p-5 font-mono text-[15px] tabular-nums sm:grid-cols-2"
            >
              {codes.map((c, i) => (
                <li key={c} className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="w-5 text-right text-xs text-muted">
                    {i + 1}
                  </span>
                  {c}
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
              <button
                type="button"
                onClick={() => void copy("codes", text)}
                className="flex min-h-12 items-center justify-center gap-2 bg-surface text-sm font-semibold text-spruce hover:bg-mint"
              >
                <Icon name={copied === "codes" ? "check" : "copy"} />
                <span aria-live="polite">{copied === "codes" ? "Copied" : "Copy all"}</span>
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
                download="spruce-recovery-codes.txt"
                className="flex min-h-12 items-center justify-center gap-2 bg-surface text-sm font-semibold text-spruce hover:bg-mint"
              >
                <Icon name="download" />
                Download
              </a>
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={async () => router.push(nextStep(await api<Me>("/me")))}>
            I&apos;ve saved them
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={"Turn on two\u2011step verification"}
      intro="Scan the code with an authenticator app, such as Google Authenticator or 1Password, then enter the 6-digit code it shows."
    >
      <div className="flex flex-col gap-6">
        <FormError message={error} />
        {setup ? (
          <>
            <div
              role="img"
              aria-label="QR code for your authenticator app"
              className="mx-auto size-52 rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)] [&_svg]:size-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <details className="group rounded-[var(--radius-control)] border border-line bg-surface text-sm">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-spruce">
                Can&apos;t scan? Enter the key by hand
                <Icon name="chevron" className="transition-transform duration-200 group-open:rotate-90" />
              </summary>
              <div className="flex items-center gap-2 border-t border-line p-3 pl-4">
                <p className="flex-1 font-mono text-[15px] tracking-wide break-normal">
                  {setup.secret.match(/.{1,4}/g)?.join(" ")}
                </p>
                <button
                  type="button"
                  onClick={() => void copy("key", setup.secret)}
                  className={buttonClasses("ghost", "md", "shrink-0 px-3")}
                >
                  <span aria-live="polite">{copied === "key" ? "Copied" : "Copy"}</span>
                  <span className="sr-only"> key</span>
                </button>
              </div>
            </details>
            <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
              <CodeField
                ref={codeRef}
                label="6-digit code"
                name="code"
                data-missing="Enter the 6-digit code from your app."
                error={errors.code}
                onInput={() => clear("code")}
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
      </div>
    </AuthShell>
  );
}
