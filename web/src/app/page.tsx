import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { brand } from "@/brand";
import { AudienceSwitch } from "@/components/home/audience-switch";
import { BookingDemo } from "@/components/home/booking-demo";
import { PreviewPlayground } from "@/components/home/preview-playground";
import { Icon, type IconName } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { CATEGORIES } from "@/lib/api";
import treatment from "../../public/photos/treatment.jpg";

// Holding page until the marketplace ships in slice 5. No venues, prices, ratings or reviews
// appear here until they are real: the booking walkthrough and the storefront card are
// labelled examples, and the card only shows what the visitor types.

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const eyebrow = "text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase";

const stats = [
  { value: "€0", label: "Booking fee" },
  { value: "10–60 km", label: "Radius search" },
  { value: "4 taps", label: "To book" },
];

const lifecycle = [
  ["Discover", "Search near you"],
  ["Book", "Real open slots"],
  ["Visit", "Reminder the day before"],
  ["Pay", "At the venue"],
  ["Review", "Only after a visit"],
];

const faqs = [
  {
    q: "Do I pay when I book?",
    a: "No. Booking on Spruce is free and needs no card. You pay the venue when you visit, by cash or card.",
  },
  {
    q: "Where is Spruce available?",
    a: "Spruce opens in Riga first, then across the EU, Iceland, Liechtenstein, Norway and Switzerland.",
  },
  {
    q: "How do you check businesses?",
    a: "A person on the Spruce team reviews every new business before customers can find it.",
  },
  {
    q: "Can I trust the reviews?",
    a: "Only customers with a completed booking can leave a review. Reviews imported from Google are labelled as such.",
  },
  {
    q: "What happens to my personal data?",
    a: "Your email and phone number are encrypted, we never sell your data, and you can download or delete it at any time.",
  },
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-30 mx-auto w-full max-w-[1280px] px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 rounded-[22px] border border-line bg-surface/85 py-2.5 pr-2.5 pl-5 shadow-[0_10px_30px_rgb(21_32_26/0.06)] backdrop-blur-md sm:pl-6">
          <Link href="/" className="rounded-md">
            <Wordmark className="text-2xl sm:text-[28px]" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {[
              ["#try", "Try booking"],
              ["#business", "For business"],
              ["#faq", "Questions"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="hidden min-h-11 items-center rounded-xl px-3.5 text-[13px] font-semibold tracking-[0.14em] text-muted uppercase transition-colors hover:bg-mint hover:text-ink lg:inline-flex"
              >
                {label}
              </a>
            ))}
            <Link href="/login" className="inline-flex min-h-11 items-center px-3.5 text-[13px] font-bold tracking-[0.14em] text-ink uppercase">
              Log in
            </Link>
            <ButtonLink href="/signup?as=business" className="max-sm:hidden">
              Business portal
              <Icon name="arrow" width={16} height={16} strokeWidth={2.2} />
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-4 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <p className={`rise ${eyebrow}`}>The botanical marketplace · Opening in Riga</p>
            <h1
              className="rise mt-5 text-[clamp(2.9rem,6.2vw,5.5rem)] leading-[0.98] font-extrabold tracking-[-0.04em]"
              style={delay(60)}
            >
              Your next
              <br />
              <span className="text-spruce">wellness</span>
              <br />
              ritual, booked.
            </h1>
            <p className="rise mt-6 max-w-[520px] text-lg leading-relaxed text-pretty text-muted" style={delay(120)}>
              Find salons, spas and studios near you, pick a real open slot, and pay at the venue.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={delay(180)}>
              <ButtonLink href="#try" size="lg">
                Try booking
                <Icon name="arrow" width={18} height={18} />
              </ButtonLink>
              <ButtonLink href="/signup?as=business" variant="secondary" size="lg">
                Grow your business
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

          <div className="rise relative min-w-0" style={delay(200)}>
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
            </div>
            {(
              [
                { icon: "clock", text: "Real open times", pos: "top-8 -left-3 sm:-left-6", d: 400 },
                { icon: "check", text: "No card needed", pos: "top-1/2 -right-2 sm:-right-5", d: 520 },
                { icon: "store", text: "Pay at the venue", pos: "bottom-8 left-6", d: 640 },
              ] satisfies { icon: IconName; text: string; pos: string; d: number }[]
            ).map((chip) => (
              <span
                key={chip.text}
                className={`float absolute ${chip.pos} flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm font-bold shadow-[var(--shadow-float)]`}
                style={delay(chip.d)}
              >
                <span className="flex size-8 items-center justify-center rounded-xl bg-mint text-spruce">
                  <Icon name={chip.icon} width={16} height={16} />
                </span>
                {chip.text}
              </span>
            ))}
          </div>
        </section>

        <section aria-labelledby="book-what" className="mx-auto w-full max-w-[1280px] px-4 pt-20 sm:px-6">
          <h2 id="book-what" className="text-center text-sm font-semibold text-muted">
            What you can book on Spruce
          </h2>
          <ul className="mt-5 flex flex-wrap justify-center gap-2.5">
            {Object.values(CATEGORIES).map((label) => (
              <li key={label} className="rounded-full border border-line bg-surface px-5 py-2.5 text-[15px] font-semibold">
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section id="try" aria-labelledby="try-title" className="mx-auto grid w-full max-w-[1280px] scroll-mt-28 items-center gap-12 px-4 pt-24 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <p className={eyebrow}>Try it</p>
            <h2 id="try-title" className="text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">
              Booking takes four taps
            </h2>
            <p className="max-w-[460px] text-lg leading-relaxed text-pretty text-muted">
              Choose a service, a professional and a time, then confirm. No account until the last step, and no card at all.
            </p>
            <ol className="mt-2 flex flex-col gap-3">
              {["Service", "Professional", "Time", "Confirm"].map((s, i) => (
                <li key={s} className="flex items-center gap-3 font-semibold">
                  <span className="flex size-8 items-center justify-center rounded-full bg-mint-strong text-sm text-spruce">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <BookingDemo />
        </section>

        <section aria-labelledby="who-title" className="mx-auto w-full max-w-[1280px] px-4 pt-28 sm:px-6">
          <h2 id="who-title" className="sr-only">
            What Spruce does for you
          </h2>
          <AudienceSwitch />
        </section>

        <section id="business" aria-labelledby="biz-title" className="mx-auto w-full max-w-[1280px] scroll-mt-28 px-4 pt-28 sm:px-6">
          <div className="relative overflow-hidden rounded-[36px] bg-forest px-6 py-12 text-white sm:px-12 sm:py-16">
            <div aria-hidden="true" className="absolute -top-32 -left-24 size-96 rounded-full bg-spruce/70 blur-3xl" />
            <div className="relative flex flex-col gap-10">
              <div className="flex max-w-[640px] flex-col gap-3">
                <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-leaf uppercase">For business</p>
                <h2 id="biz-title" className="text-4xl font-bold tracking-[-0.03em] text-balance sm:text-5xl">
                  See your business on Spruce
                </h2>
                <p className="text-lg text-pretty text-leaf">
                  Type your name and pick what you offer. This is the card customers will tap to book you.
                </p>
              </div>
              <PreviewPlayground />
              <ButtonLink href="/signup?as=business" size="lg" variant="secondary" className="self-start">
                Set up your business
                <Icon name="arrow" width={18} height={18} />
              </ButtonLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="loop-title" className="mx-auto w-full max-w-[1280px] px-4 pt-28 sm:px-6">
          <div className="text-center">
            <p className={eyebrow}>From search to review</p>
            <h2 id="loop-title" className="mt-2.5 text-4xl font-bold tracking-[-0.03em] sm:text-[40px]">
              One visit, start to finish
            </h2>
          </div>
          <ol className="relative mt-12 grid gap-6 sm:grid-cols-5">
            <span aria-hidden="true" className="absolute top-7 right-[10%] left-[10%] hidden h-px bg-line-strong sm:block" />
            {lifecycle.map(([label, sub], i) => (
              <li key={label} className="group relative flex items-center gap-4 sm:flex-col sm:text-center">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-mint-strong bg-surface text-[15px] font-bold text-spruce transition-[background-color,color,transform] duration-300 group-hover:-translate-y-1 group-hover:bg-spruce group-hover:text-white">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-bold">{label}</span>
                  <span className="text-sm text-muted">{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mx-auto grid w-full max-w-[1280px] scroll-mt-28 gap-10 px-4 py-28 sm:px-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <p className={eyebrow}>Questions</p>
            <h2 id="faq-title" className="text-4xl font-bold tracking-[-0.03em]">
              Good to know
            </h2>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-[20px] border border-line bg-surface open:shadow-[var(--shadow-card)]">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-mint text-spruce transition-transform duration-300 group-open:rotate-45">
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="px-6 pb-5 leading-relaxed text-pretty text-muted">{f.a}</p>
              </details>
            ))}
          </div>
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
