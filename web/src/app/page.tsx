import Link from "next/link";
import type { CSSProperties } from "react";

import { brand } from "@/brand";
import { Botanical } from "@/components/botanical";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";

// Holding page until the marketplace ships in slice 5. No prices, venues or ratings
// appear here until they are real. The booking card shows the flow, not a real venue.

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const steps = [
  { label: "Service", value: "Haircut and styling" },
  { label: "Professional", value: "Anyone available" },
  { label: "Time", value: "Pick an open slot" },
];

const times = ["09:30", "10:15", "11:00", "13:45", "14:30", "16:00"];

const promises = [
  {
    title: "Real open times",
    text: "Times come straight from each venue's calendar, so the slot you pick is the slot you get.",
  },
  {
    title: "Pay at the venue",
    text: "Booking is free and needs no card. You pay the venue when you visit, the way you always have.",
  },
  {
    title: "Your data, protected",
    text: "Built for GDPR from day one. Personal details are encrypted, and no venue sees another venue's clients.",
  },
];

const forBusiness = [
  "A calendar that blocks double bookings by design",
  "Staff permissions you decide, off until you turn them on",
  "Two-step verification on every business account",
];

export default function Home() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <ButtonLink href="/login" variant="ghost">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup?as=business" variant="secondary" className="max-sm:hidden">
            List your business
          </ButtonLink>
        </nav>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-8 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-16 lg:pb-28">
          <div>
            <p className="rise text-xs font-semibold tracking-[var(--tracking-label)] text-spruce uppercase">
              Opening soon in Riga
            </p>
            <h1
              className="rise mt-5 text-[2.6rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl"
              style={delay(60)}
            >
              Book your wellness rituals, <span className="text-spruce">without the phone tag.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg text-pretty text-muted" style={delay(120)}>
              Find salons, spas and studios near you, see real open times, and pay at the venue.
            </p>
            <div className="rise mt-10 flex flex-wrap gap-3" style={delay(180)}>
              <ButtonLink href="/signup" size="lg">
                Create an account
              </ButtonLink>
              <ButtonLink href="/signup?as=business" variant="secondary" size="lg">
                List your business
              </ButtonLink>
            </div>
          </div>

          <div className="rise relative" style={delay(200)}>
            <div className="relative overflow-hidden rounded-[32px] bg-forest px-6 pt-10 pb-6 sm:px-10 sm:pt-14 sm:pb-10">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(110%_70%_at_90%_0%,rgb(27_67_50/0.95),transparent_60%)]"
              />
              <Botanical className="absolute -top-4 -right-6 h-[115%] text-sage opacity-40" />

              <figure className="relative ml-auto max-w-sm rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-float)] sm:p-6">
                <figcaption className="text-xs font-semibold tracking-[var(--tracking-label)] text-muted uppercase">
                  How booking works
                </figcaption>
                <ol className="mt-4 flex flex-col gap-2">
                  {steps.map((s, i) => (
                    <li
                      key={s.label}
                      className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2.5"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-xs font-bold text-spruce">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs text-muted">{s.label}</span>
                        <span className="block truncate text-sm font-semibold">{s.value}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div aria-hidden="true" className="mt-4 grid grid-cols-3 gap-2">
                  {times.map((t) => (
                    <span
                      key={t}
                      className={
                        t === "14:30"
                          ? "rounded-full bg-spruce py-2 text-center text-sm font-semibold text-white"
                          : "rounded-full border border-line-strong py-2 text-center text-sm text-ink"
                      }
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-3 rounded-[var(--radius-control)] bg-mint px-3 py-3 text-sm font-semibold text-spruce">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-spruce text-xs text-white">
                    4
                  </span>
                  Confirm, then pay at the venue
                </p>
              </figure>
            </div>
          </div>
        </section>

        <section aria-labelledby="why" className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-20">
            <h2 id="why" className="max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Booking that respects your time.
            </h2>
            <ul className="mt-12 grid gap-10 md:grid-cols-3">
              {promises.map((p, i) => (
                <li key={p.title} className="flex flex-col gap-3">
                  <span className="text-sm font-semibold text-spruce tabular-nums">0{i + 1}</span>
                  <h3 className="text-lg font-semibold">{p.title}</h3>
                  <p className="text-pretty text-muted">{p.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="business" className="mx-auto w-full max-w-6xl px-5 py-20">
          <div className="grid gap-10 rounded-[32px] border border-line bg-mint p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[var(--tracking-label)] text-spruce uppercase">
                For salons, spas and studios
              </p>
              <h2 id="business" className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Fill your calendar, keep your clients.
              </h2>
              <div className="mt-8">
                <ButtonLink href="/signup?as=business" size="lg">
                  List your business
                </ButtonLink>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {forBusiness.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-3 rounded-[var(--radius-control)] bg-surface px-4 py-4 shadow-[var(--shadow-card)]"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-spruce">
                    <path
                      d="M5 10.5l3.2 3L15 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-medium">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <p>© {brand.name}</p>
          <nav aria-label="Legal" className="flex gap-1">
            <Link href="/terms" className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-ink">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
