import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Botanical } from "@/components/botanical";
import { Wordmark } from "@/components/ui/wordmark";

const points = [
  { title: "Real open times", text: "See when a professional is actually free, then book in a few taps." },
  { title: "Pay at the venue", text: "No card needed to book. You pay the venue when you visit." },
  { title: "Safe by default", text: "Encrypted personal data, and two-step verification for every business." },
];

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:p-3">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header>
          <Link href="/" className="inline-block rounded-md">
            <Wordmark className="text-2xl" />
          </Link>
        </header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="rise flex flex-col gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
            {intro && <div className="text-pretty text-muted">{intro}</div>}
          </div>
          <div className="rise mt-8" style={delay(70)}>
            {children}
          </div>
          {footer && (
            <div className="rise mt-8 border-t border-line pt-6 text-sm text-muted" style={delay(140)}>
              {footer}
            </div>
          )}
        </main>
      </div>

      <aside
        aria-label="About booking"
        className="relative hidden flex-col justify-end overflow-hidden rounded-[32px] bg-forest p-12 text-white lg:flex"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,rgb(27_67_50/0.9),transparent_60%)]"
        />
        <Botanical className="absolute -top-6 right-6 h-[62%] text-sage opacity-50" />
        <div className="relative flex max-w-md flex-col gap-8">
          <p className="text-3xl leading-tight font-semibold text-balance">
            Beauty and wellness, booked in a minute.
          </p>
          <ul className="flex flex-col gap-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-leaf" />
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-leaf">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Announced to screen readers as soon as it appears. */
export function FormError({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {message && (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
