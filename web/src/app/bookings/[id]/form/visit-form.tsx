"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { PublicHeader } from "@/components/public-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, ApiError, type VisitForm } from "@/lib/api";

/** A customer's consultation form for one visit (slice 13). Answers can change until it starts. */
export function VisitFormPage() {
  const router = useRouter();
  const { id: bookingId } = useParams<{ id: string }>();
  const [form, setForm] = useState<VisitForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const savedRef = useRef<HTMLDivElement>(null);
  const url = `/bookings/${bookingId}/form`;

  useEffect(() => {
    api<VisitForm>(url)
      .then(setForm)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [router, url]);

  useEffect(() => {
    if (saved) savedRef.current?.focus();
  }, [saved]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const data = new FormData(event.currentTarget);
    const answers = form.questions.map((q, i) => {
      const value = data.get(`q${i}`);
      if (q.kind === "text") return String(value ?? "").trim();
      return value === null ? null : value === "yes";
    });
    const unanswered = answers.flatMap((a, i) => (a === null ? [i] : []));
    const agreed = data.get("consent") === "on";
    setMissing(unanswered);
    setConsentMissing(!agreed);
    if (unanswered.length > 0) {
      document.getElementsByName(`q${unanswered[0]}`)[0]?.focus();
      return;
    }
    if (!agreed) {
      document.getElementById("consent")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setForm(await api<VisitForm>(url, { method: "PUT", body: { answers, consent: true } }));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader />
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        <Link
          href="/bookings"
          className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-spruce"
        >
          ← Your bookings
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{form?.name ?? "Before your visit"}</h1>
          <p className="mt-1 text-muted">
            The venue asks this before your visit. Only the venue owner and the person doing your visit see your
            answers, and you can change them until it starts.
          </p>
        </div>
        <FormError message={error} />
        {!form && !error && <p className="text-muted">Loading…</p>}
        {saved && (
          <div
            ref={savedRef}
            tabIndex={-1}
            role="status"
            className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] bg-mint p-5"
          >
            <p className="font-semibold text-spruce">Thanks, the venue has your answers.</p>
            <ButtonLink href="/bookings" variant="secondary">
              Back to your bookings
            </ButtonLink>
          </div>
        )}
        {form && (
          <form noValidate onSubmit={submit} onInput={() => setSaved(false)} className="flex flex-col gap-5">
            {form.questions.map((q, i) =>
              q.kind === "text" ? (
                <div key={i} className="flex flex-col gap-1.5">
                  <label htmlFor={`q${i}`} className="font-semibold">
                    {q.label} <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <textarea
                    id={`q${i}`}
                    name={`q${i}`}
                    maxLength={1000}
                    rows={3}
                    defaultValue={typeof form.answers?.[i] === "string" ? String(form.answers[i]) : ""}
                    className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base hover:border-muted focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]"
                  />
                </div>
              ) : (
                <fieldset
                  key={i}
                  aria-describedby={missing.includes(i) ? `q${i}-error` : undefined}
                  className="flex flex-col gap-1"
                >
                  <legend className="font-semibold">
                    {q.label}
                    <span className="font-normal text-muted">
                      {" "}
                      <span aria-hidden="true">*</span>
                      <span className="sr-only">(required)</span>
                    </span>
                  </legend>
                  <div className="flex gap-6">
                    {(["yes", "no"] as const).map((v) => (
                      <label key={v} className="flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          name={`q${i}`}
                          value={v}
                          defaultChecked={form.answers?.[i] === (v === "yes")}
                          onChange={() => setMissing((m) => m.filter((x) => x !== i))}
                          className="size-5 accent-spruce"
                        />
                        {v === "yes" ? "Yes" : "No"}
                      </label>
                    ))}
                  </div>
                  {missing.includes(i) && (
                    <p id={`q${i}-error`} className="text-sm font-medium text-danger">
                      Choose yes or no.
                    </p>
                  )}
                </fieldset>
              ),
            )}
            <div className="flex flex-col gap-1">
              <label className="flex min-h-11 items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  name="consent"
                  defaultChecked={form.answers !== null}
                  onChange={() => setConsentMissing(false)}
                  aria-describedby={consentMissing ? "consent-error" : undefined}
                  className="mt-0.5 size-5 shrink-0 accent-spruce"
                />
                <span>
                  I agree to the venue keeping these answers with this booking, to make my visit safe. To have them
                  removed, ask the venue.
                  <span className="font-normal text-muted">
                    {" "}
                    <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </span>
                </span>
              </label>
              {consentMissing && (
                <p id="consent-error" className="text-sm font-medium text-danger">
                  Tick this box to send your answers. They may include health information.
                </p>
              )}
            </div>
            <Button type="submit" size="lg" loading={busy} className="self-start">
              {form.answers ? "Save changes" : "Send answers"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
