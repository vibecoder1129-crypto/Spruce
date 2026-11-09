"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  api,
  CATEGORIES,
  isoDate,
  mondayOf,
  REJECT_REASONS,
  type Channel,
  type ChannelCount,
  type Place,
  type Service,
  type Shift,
  type Staff,
} from "@/lib/api";
import { cn } from "@/lib/cn";

import { useBusiness } from "./shell";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;
const tints = ["bg-mint-strong", "bg-[#f4e3d3]", "bg-[#e4e8f2]", "bg-[#f2e4e8]"];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardHome() {
  const { business } = useBusiness();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [shiftCount, setShiftCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Place[]>(`/businesses/${business.id}/locations`),
      api<Staff[]>(`/businesses/${business.id}/staff`),
      api<Service[]>(`/businesses/${business.id}/services`),
      api<Shift[]>(`/businesses/${business.id}/shifts?week=${mondayOf(isoDate(new Date()))}`),
    ])
      .then(([p, s, sv, sh]) => {
        setPlaces(p);
        setStaff(s);
        setServices(sv);
        setShiftCount(sh.length);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [business.id]);

  return (
    <>
      <div className="rise flex flex-col gap-1">
        <p className="text-sm font-semibold text-muted">{greeting()}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{business.name}</h1>
        <p className="text-sm font-semibold text-spruce">{CATEGORIES[business.category]}</p>
      </div>
      <ReviewTracker />
      <FormError message={error} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Checklist
          placeCount={places?.length ?? 0}
          staffCount={staff?.length ?? 0}
          serviceCount={services?.filter((sv) => sv.active).length ?? 0}
          shiftCount={shiftCount}
        />
        <div className="flex flex-col gap-6">
          {business.approval_status === "approved" && <BookingLink businessId={business.id} name={business.name} />}
          <section aria-labelledby="places-title" className="rise rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]" style={delay(160)}>
            <h2 id="places-title" className="text-lg font-bold">
              {places && places.length > 1 ? "Locations" : "Location"}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {places?.map((p) => (
                <li key={p.id} className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-mint text-spruce">
                    <Icon name="pin" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-sm text-muted">{p.address_text}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Icon name="clock" width={14} height={14} />
                      Times shown in {p.timezone.replace("_", " ").split("/").pop()} time
                    </span>
                  </span>
                </li>
              )) ?? <li className="text-muted">Loading…</li>}
            </ul>
          </section>
          <section aria-labelledby="team-title" className="rise rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]" style={delay(220)}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="team-title" className="text-lg font-bold">
                Team
              </h2>
              <Link
                href="/dashboard/team"
                className="-my-2 flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-semibold text-spruce hover:bg-mint"
              >
                Manage<span className="sr-only"> team</span>
              </Link>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {staff?.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", tints[i % tints.length])}>
                    {initials(s.display_name)}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{s.display_name}</span>
                    {s.title && <span className="text-sm text-muted">{s.title}</span>}
                  </span>
                </li>
              )) ?? <li className="text-muted">Loading…</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

const PLACES: { value: Channel | "anywhere"; label: string; how: string }[] = [
  { value: "anywhere", label: "Anywhere", how: "For messages, email or your business card." },
  { value: "website", label: "Website", how: "Link a menu item or button on your website to it, or use the button below." },
  { value: "instagram", label: "Instagram", how: "In Instagram, tap Edit profile, then Links, and add it." },
  { value: "google", label: "Google", how: "In your Google Business Profile, edit your profile and add it as your booking link." },
  { value: "facebook", label: "Facebook", how: "On your Facebook page, add a Book now button and paste it there." },
];
const PLACE_NAMES: Record<Channel, string> = { website: "Your website", instagram: "Instagram", google: "Google", facebook: "Facebook" };

/** Feature list 7.3: the venue's own link and a button for its website, Instagram bio or Google profile (slices 5a, 10). */
function BookingLink({ businessId, name }: { businessId: string; name: string }) {
  // Known only in the browser; empty on the server.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [place, setPlace] = useState<Channel | "anywhere">("anywhere");
  const [copied, setCopied] = useState<"link" | "button" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ChannelCount[]>([]);
  const base = `${origin}/b/${businessId}/book`;
  const link = place === "anywhere" ? base : `${base}?from=${place}`;
  const escaped = name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const buttonStyle =
    "display:inline-block;padding:12px 24px;border-radius:999px;" +
    "background:#1b4332;color:#fff;font:600 16px/1.2 sans-serif;text-decoration:none";
  const snippet = `<a href="${base}?from=website" style="${buttonStyle}">Book at ${escaped}</a>`;
  const total = counts.reduce((sum, c) => sum + c.bookings, 0);

  useEffect(() => {
    api<ChannelCount[]>(`/businesses/${businessId}/channels`)
      .then(setCounts)
      .catch(() => undefined); // the counts are extra; the link works without them
  }, [businessId]);

  async function copy(what: "link" | "button", text: string) {
    setError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it yourself.");
    }
  }

  return (
    <section aria-labelledby="link-title" className="rise rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]" style={delay(100)}>
      <h2 id="link-title" className="text-lg font-bold">
        Your booking link
      </h2>
      <p className="mt-1 text-sm text-muted">Each place gets its own link, so you can see where bookings come from.</p>
      <FormError message={error} />
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Where will you share it?</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PLACES.map((p) => (
            <label
              key={p.value}
              className="flex min-h-11 cursor-pointer items-center rounded-full border border-line-strong px-4 text-sm font-semibold has-checked:border-spruce has-checked:bg-mint has-checked:text-spruce has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-spruce"
            >
              <input
                type="radio"
                name="share-place"
                value={p.value}
                checked={place === p.value}
                onChange={() => {
                  setPlace(p.value);
                  setCopied(null);
                }}
                className="sr-only"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label htmlFor="booking-link" className="mt-4 block text-sm font-semibold">
        Link
      </label>
      <p id="booking-link-how" className="text-sm text-muted">
        {PLACES.find((p) => p.value === place)?.how}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          id="booking-link"
          readOnly
          value={link}
          aria-describedby="booking-link-how"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-ground px-3 text-sm"
        />
        <Button variant="secondary" onClick={() => copy("link", link)}>
          <Icon name="copy" /> {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>
      <label htmlFor="booking-button" className="mt-4 block text-sm font-semibold">
        Button for your website
      </label>
      <figure className="mt-1.5 flex flex-col items-start gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong p-4">
        <span
          aria-hidden="true"
          className="inline-block rounded-full bg-[#1b4332] px-6 py-3 font-sans text-base leading-tight font-semibold text-white"
        >
          Book at {name}
        </span>
        <figcaption className="text-xs text-muted">How it looks on your website</figcaption>
      </figure>
      <textarea
        id="booking-button"
        readOnly
        rows={3}
        value={snippet}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full rounded-[var(--radius-control)] border border-line-strong bg-ground px-3 py-2 font-mono text-xs"
      />
      <Button variant="secondary" className="mt-2" onClick={() => copy("button", snippet)}>
        <Icon name="copy" /> {copied === "button" ? "Copied" : "Copy button code"}
      </Button>
      <p role="status" className="sr-only">
        {copied ? "Copied to your clipboard." : ""}
      </p>
      {total > 0 && (
        <section aria-labelledby="channels-title" className="mt-6 border-t border-line pt-4">
          <h3 id="channels-title" className="font-bold">
            Where online bookings came from
          </h3>
          <p className="text-sm text-muted">Last 30 days</p>
          <dl className="mt-2 flex flex-col gap-1.5">
            {counts.map((c) => (
              <div key={c.channel ?? "spruce"} className="flex items-baseline justify-between gap-3 text-sm">
                <dt>{c.channel ? PLACE_NAMES[c.channel] : "Found you on Spruce"}</dt>
                <dd className="font-semibold tabular-nums">{c.bookings}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </section>
  );
}

/** Where the business is in review: set up, checked by Spruce, then live. */
function ReviewTracker() {
  const { business, reload } = useBusiness();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = business.approval_status;
  const reached = status === "approved" ? 3 : 2;
  const stages = [
    { label: "Set up", detail: "Business, location and team" },
    {
      label: status === "rejected" ? "Not approved" : "Review",
      detail: status === "rejected" ? "Changes needed" : status === "approved" ? "Checked by Spruce" : "Checking your details",
    },
    { label: "Approved", detail: status === "approved" ? "You're on Spruce" : "Bookings can open" },
  ];

  const headline = {
    pending: "Your business is in review",
    approved: "Your business is approved",
    rejected: "Your business needs a few changes",
    suspended: "Your business is suspended",
  }[status];
  const body = {
    pending: "A person on the Spruce team is checking your details. This page updates when they're done.",
    approved: "Next, add your services and plan this week's shifts. Then share your booking link so customers can book online.",
    rejected: "",
    suspended: "Your business is hidden from customers. Contact Spruce support to find out why.",
  }[status];

  return (
    <section
      aria-labelledby="review-title"
      className="rise relative overflow-hidden rounded-[32px] bg-forest p-6 text-white sm:p-8"
      style={delay(80)}
    >
      <div aria-hidden="true" className="absolute -top-24 -right-20 size-72 rounded-full bg-spruce/60 blur-3xl" />
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span
            className={cn(
              "self-start rounded-full px-3 py-1 text-xs font-bold",
              status === "approved" ? "bg-leaf text-forest" : status === "rejected" ? "bg-[#fbeceb] text-danger" : "bg-[#fbf3e2] text-ink",
            )}
          >
            {{ pending: "In review", approved: "Approved", rejected: "Not approved", suspended: "Suspended" }[status]}
          </span>
          <h2 id="review-title" className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            {headline}
          </h2>
          {body && <p className="max-w-prose text-pretty text-leaf">{body}</p>}
        </div>

        {status !== "suspended" && (
          <ol aria-label="Review progress" className="grid gap-3 sm:grid-cols-3">
            {stages.map((s, i) => {
              const done = i < reached || (i === 1 && status === "approved");
              const current = i === reached - 1 && status !== "approved" && i > 0;
              const failed = i === 1 && status === "rejected";
              return (
                <li
                  key={s.label}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl p-3",
                    current ? "bg-white/10 ring-1 ring-white/20" : "bg-white/5",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex size-9 shrink-0 items-center justify-center rounded-full",
                      failed ? "bg-[#fbeceb] text-danger" : done ? "bg-leaf text-forest" : current ? "bg-white text-forest" : "bg-white/10 text-leaf",
                    )}
                  >
                    {failed ? (
                      <Icon name="close" width={16} height={16} strokeWidth={2.4} />
                    ) : done && !current ? (
                      <Icon name="check" width={16} height={16} strokeWidth={2.6} className="pop" />
                    ) : (
                      <>
                        {current && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-white/40" />}
                        <Icon name="clock" width={16} height={16} />
                      </>
                    )}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{s.label}</span>
                    <span className="text-xs text-leaf">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {status === "rejected" && (
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 text-ink">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">
                Reason: {business.rejection_reason ? REJECT_REASONS[business.rejection_reason] : ""}
              </p>
              {business.rejection_note && <p className="text-pretty text-muted">{business.rejection_note}</p>}
            </div>
            <FormError message={error} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api(`/businesses/${business.id}/submit`, { method: "POST" });
                    await reload();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "That didn't work.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Resubmit for review
              </Button>
              <ButtonLink href="/onboarding" variant="secondary">
                Edit details first
              </ButtonLink>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** What the owner has done and what comes next. Later items are honest about not being ready. */
function Checklist({
  placeCount,
  staffCount,
  serviceCount,
  shiftCount,
}: {
  placeCount: number;
  staffCount: number;
  serviceCount: number;
  shiftCount: number;
}) {
  const items: { label: string; done: boolean; href?: string }[] = [
    { label: "Business details", done: true },
    { label: "First location", done: placeCount > 0 },
    { label: "First team member", done: staffCount > 0, href: "/dashboard/team" },
    { label: "Services and prices", done: serviceCount > 0, href: "/dashboard/services" },
    { label: "This week's shifts", done: shiftCount > 0, href: "/dashboard/team/shifts" },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const share = doneCount / items.length;
  const r = 34;
  const circumference = 2 * Math.PI * r;

  return (
    <section
      aria-labelledby="ready-title"
      className="rise flex flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
      style={delay(120)}
    >
      <div className="flex items-center gap-5">
        <div className="relative size-20 shrink-0">
          <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-line)" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              stroke="var(--color-spruce)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - share)}
              className="transition-[stroke-dashoffset] duration-1000 ease-[var(--ease-out)]"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
            {Math.round(share * 100)}%
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="ready-title" className="text-lg font-bold">
            Get ready for bookings
          </h2>
          <p className="text-sm text-muted">
            {doneCount} of {items.length} done.{" "}
            {items.some((i) => !i.done && i.href) ? "Pick up where you left off below." : "You can take walk-ins on the calendar now."}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const todo = !item.done && item.href;
          const body = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  item.done ? "bg-spruce text-white" : todo ? "border-2 border-spruce" : "border-2 border-dashed border-line-strong",
                )}
              >
                {item.done && <Icon name="check" width={13} height={13} strokeWidth={3} />}
              </span>
              <span className={cn("flex-1 text-sm font-semibold", !item.done && !todo && "text-muted")}>
                {item.label}
                <span className="sr-only">{item.done ? ", done" : todo ? ", to do" : ", not yet available"}</span>
              </span>
              {todo && (
                <span className="flex items-center gap-1 text-xs font-bold tracking-[var(--tracking-label)] text-spruce uppercase">
                  Start
                  <Icon name="arrow" width={14} height={14} />
                </span>
              )}
            </>
          );
          const row = "flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3";
          return (
            <li key={item.label}>
              {todo ? (
                <Link
                  href={item.href!}
                  className={cn(row, "border border-spruce/30 bg-surface transition-colors duration-200 hover:bg-mint")}
                >
                  {body}
                </Link>
              ) : (
                <div className={cn(row, item.done && "bg-mint/60")}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
