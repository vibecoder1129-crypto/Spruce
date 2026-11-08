"use client";

import { useState, type CSSProperties } from "react";

import { Icon, type IconName } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const AUDIENCES = {
  customers: {
    tab: "For customers",
    title: "Book in a minute, pay when you visit",
    cta: { href: "/signup", label: "Create an account" },
    points: [
      { icon: "pin", title: "Near you", body: "Search venues within 10 to 60 km, with the distance on each one." },
      { icon: "clock", title: "Real open times", body: "Only slots a professional is actually free for. No call-backs." },
      { icon: "reviews", title: "Honest reviews", body: "Reviews come only from completed bookings, so every one is real." },
      { icon: "shield", title: "Your data, protected", body: "Personal details are encrypted and never sold." },
    ],
  },
  business: {
    tab: "For businesses",
    title: "Run your day, fill your chairs",
    cta: { href: "/signup?as=business", label: "Create a business account" },
    points: [
      { icon: "calendar", title: "Staff day board", body: "Every professional's day from 08:00 to 20:00, with walk-ins and time off." },
      { icon: "team", title: "Access you choose", body: "Each team member gets only the permissions you give them." },
      { icon: "store", title: "Every location", body: "Run several venues from one account, each in its own time zone." },
      { icon: "reports", title: "Reports", body: "Sales, bookings and no-shows, ready for month end." },
    ],
  },
} satisfies Record<string, { tab: string; title: string; cta: { href: string; label: string }; points: { icon: IconName; title: string; body: string }[] }>;

type Key = keyof typeof AUDIENCES;

export function AudienceSwitch() {
  const [who, setWho] = useState<Key>("customers");
  const a = AUDIENCES[who];
  return (
    <div className="flex flex-col gap-8">
      <div role="group" aria-label="Show features for" className="flex self-center rounded-[18px] bg-line p-1.5">
        {(Object.keys(AUDIENCES) as Key[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={who === k}
            onClick={() => setWho(k)}
            className={cn(
              "min-h-11 rounded-[14px] px-5 text-sm font-bold transition-[background-color,color,box-shadow] duration-300",
              who === k ? "bg-ink text-white shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
            )}
          >
            {AUDIENCES[k].tab}
          </button>
        ))}
      </div>
      <div key={who} className="slide-in flex flex-col gap-8">
        <h3 className="text-center text-3xl font-bold tracking-[-0.02em] text-balance">{a.title}</h3>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {a.points.map((p, i) => (
            <li
              key={p.title}
              className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6 transition-transform duration-300 hover:-translate-y-1"
              style={{ "--delay": `${i * 60}ms` } as CSSProperties}
            >
              <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] bg-mint text-spruce">
                <Icon name={p.icon} />
              </span>
              <span className="text-lg font-bold">{p.title}</span>
              <span className="text-[15px] leading-relaxed text-muted">{p.body}</span>
            </li>
          ))}
        </ul>
        <ButtonLink href={a.cta.href} size="lg" className="self-center">
          {a.cta.label}
          <Icon name="arrow" width={18} height={18} />
        </ButtonLink>
      </div>
    </div>
  );
}
