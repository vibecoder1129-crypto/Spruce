import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { brand } from "@/brand";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import treatment from "../../public/photos/treatment.jpg";

// Holding page until the marketplace ships in slice 5, laid out after the approved canvas.
// No venues, prices, ratings or reviews appear here until they are real. The booking card
// shows how booking works, not a real venue.

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const eyebrow = "text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase";

const stats = [
  { value: "€0", label: "Booking fee" },
  { value: "10–60 km", label: "Radius search" },
  { value: "100%", label: "Pay at venue" },
];

const lifecycle = [
  ["Marketplace", "Discover"],
  ["Availability", "Live slots"],
  ["Booking", "Four taps"],
  ["Calendar", "Staff day board"],
  ["Completion", "Checkout"],
  ["Sale", "Pay at venue"],
  ["Analytics", "Reports"],
];

const features = [
  {
    kicker: "Discovery",
    title: "Marketplace discovery",
    body: "Search by location from 10 to 60 km, with real open slots and the distance on every venue.",
  },
  {
    kicker: "Operations",
    title: "Business management",
    body: "A staff day board from 08:00 to 20:00, weekly shifts, walk-ins and checkout across every location.",
  },
  {
    kicker: "Flexibility",
    title: "Pay at the venue",
    body: "No card details at booking. Clients pay by cash or card when they visit.",
  },
  {
    kicker: "Trust",
    title: "Safe by design",
    body: "Personal details are encrypted, staff get only the access you give them, and businesses use two-step sign-in.",
  },
];

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-12 place-items-center rounded-[var(--radius-control)] bg-mint text-spruce">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

export default function Home() {
  return (
    <>
      <header className="mx-auto w-full max-w-[1280px] px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-line bg-surface/90 py-2.5 pr-2.5 pl-5 shadow-[0_10px_30px_rgb(21_32_26/0.05)] sm:pl-6">
          <Link href="/" className="rounded-md">
            <Wordmark className="text-2xl sm:text-[28px]" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            <a href="#how" className="hidden min-h-11 items-center px-3.5 text-[13px] font-semibold tracking-[0.14em] text-muted uppercase hover:text-ink lg:inline-flex">
              How it works
            </a>
            <a href="#business" className="hidden min-h-11 items-center px-3.5 text-[13px] font-semibold tracking-[0.14em] text-muted uppercase hover:text-ink lg:inline-flex">
              For business
            </a>
            <Link href="/login" className="inline-flex min-h-11 items-center px-3.5 text-[13px] font-bold tracking-[0.14em] text-ink uppercase">
              Log in
            </Link>
            <ButtonLink href="/signup?as=business" className="max-sm:hidden">
              Business portal
              <Arrow />
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <p className={`rise ${eyebrow}`}>The botanical marketplace · Opening in Riga</p>
            <h1
              className="rise mt-5 text-[clamp(3rem,6.4vw,5.75rem)] leading-[0.95] font-extrabold tracking-[-0.04em]"
              style={delay(60)}
            >
              Book your
              <br />
              wellness
              <br />
              <span className="text-spruce">rituals.</span>
            </h1>
            <p className="rise mt-6 max-w-[520px] text-lg leading-relaxed text-pretty text-muted" style={delay(120)}>
              Discover salons, spas and studios near you, book real open slots, and pay at the venue.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={delay(180)}>
              <ButtonLink href="/signup" size="lg">
                Create an account
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="4" y="5" width="16" height="15" rx="2" />
                  <path d="M8 3v4M16 3v4M4 10h16" />
                </svg>
              </ButtonLink>
              <ButtonLink href="/signup?as=business" variant="secondary" size="lg">
                Grow your business
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M7 17L17 7M9 7h8v8" />
                </svg>
              </ButtonLink>
            </div>
            <dl className="rise mt-9 flex flex-wrap gap-x-11 gap-y-5 border-t border-line-warm pt-6" style={delay(240)}>
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col-reverse">
                  <dt className="mt-1 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{s.label}</dt>
                  <dd className="text-3xl font-bold tracking-[-0.02em]">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rise min-w-0" style={delay(200)}>
            <div className="relative h-[420px] overflow-hidden rounded-[32px] border-[6px] border-surface bg-forest shadow-[0_30px_60px_rgb(21_32_26/0.16)] sm:h-[560px]">
              <Image
                src={treatment}
                alt="A therapist giving a shoulder massage in a calm treatment room full of plants"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 rounded-[18px] bg-spruce/95 px-5 py-4 text-white sm:inset-x-5 sm:bottom-5">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] text-leaf uppercase">How booking works</p>
                  <p className="mt-1 text-base font-bold sm:text-lg">Service, professional, time, done.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-leaf">No card needed</p>
                  <p className="mt-0.5 font-bold">Pay at the venue</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Who Spruce is for" className="mx-auto w-full max-w-[1280px] px-4 pt-20 sm:px-6">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[28px] border border-line bg-surface p-8">
              <IconTile>
                <path d="M12 21c-4-2-7-5.5-7-10 3 0 5.5 1.5 7 4 1.5-2.5 4-4 7-4 0 4.5-3 8-7 10zM12 15V3" />
              </IconTile>
              <h2 className="mt-5 mb-2 text-2xl font-bold tracking-[-0.02em]">Find your next wellness escape</h2>
              <p className="text-[15px] leading-relaxed text-muted">
                Book salons and spa specialists near you, with real open times and reviews only from completed visits.
              </p>
              <ButtonLink href="/signup" className="mt-6">
                Sign up as a client
              </ButtonLink>
            </div>
            <div id="business" className="scroll-mt-6 rounded-[28px] border border-line bg-surface p-8">
              <IconTile>
                <path d="M4 10h16l-1-5H5zM5 10v10h14V10M9 20v-5h6v5" />
              </IconTile>
              <h2 className="mt-5 mb-2 text-2xl font-bold tracking-[-0.02em]">Grow your salon</h2>
              <p className="text-[15px] leading-relaxed text-muted">
                List your business, run staff rosters from 08:00 to 20:00, and give each employee only the access you choose.
              </p>
              <ButtonLink href="/signup?as=business" variant="secondary" className="mt-6">
                Create a business account
              </ButtonLink>
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="mx-auto w-full max-w-[1280px] scroll-mt-6 px-4 pt-24 text-center sm:px-6">
          <p className="inline-block rounded-full bg-mint px-3 py-1.5 text-[11px] font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">
            End to end
          </p>
          <h2 id="how-title" className="mt-4 mb-2.5 text-4xl font-bold tracking-[-0.03em] sm:text-[40px]">
            The Spruce lifecycle
          </h2>
          <p className="mx-auto max-w-[560px] leading-relaxed text-muted">
            One loop connecting clients with wellness professionals and the back office that runs their day.
          </p>
          <ol className="mt-11 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-7">
            {lifecycle.map(([label, sub], i) => {
              const last = i === lifecycle.length - 1;
              return (
                <li key={label} className="flex flex-col items-center gap-2.5">
                  <span
                    className={
                      "grid size-14 place-items-center rounded-2xl border text-[15px] font-bold " +
                      (last ? "border-spruce bg-spruce text-white" : "border-mint-strong bg-surface text-spruce")
                    }
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-bold tracking-[0.14em] uppercase">{label}</span>
                  <span className="text-[13px] text-muted">{sub}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="features-title" className="mx-auto w-full max-w-[1280px] px-4 py-24 sm:px-6">
          <div className="text-center">
            <p className={eyebrow}>One platform</p>
            <h2 id="features-title" className="mt-2.5 text-4xl font-bold tracking-[-0.03em] sm:text-[40px]">
              Everything you need in one place
            </h2>
          </div>
          <ul className="mt-9 grid gap-5 md:grid-cols-2">
            {features.map((f, i) => (
              <li key={f.title} className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-7">
{/* Decorative numeral as generated content, so it is neither read out nor counted as text. */}
                <span
                  aria-hidden="true"
                  data-n={String(i + 1).padStart(2, "0")}
                  className="absolute top-2 right-5 text-7xl font-extrabold text-watermark before:content-[attr(data-n)]"
                />
                <p className="relative text-[11px] font-bold tracking-[0.16em] text-spruce uppercase">{f.kicker}</p>
                <h3 className="relative mt-2 mb-2 text-[22px] font-bold tracking-[-0.02em]">{f.title}</h3>
                <p className="relative text-[15px] leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="bg-ink text-footer-text">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-6 px-4 py-11 sm:px-6">
          <span aria-hidden="true">
            <Wordmark tone="light" className="text-[26px]" />
          </span>
          <p className="text-sm">
            © {brand.name} · Pay at the venue · Reviews only from completed bookings
          </p>
          <nav aria-label="Legal" className="flex gap-2 text-sm">
            <Link href="/privacy" className="inline-flex min-h-11 items-center px-1 text-white underline-offset-4 hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center px-1 text-white underline-offset-4 hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
