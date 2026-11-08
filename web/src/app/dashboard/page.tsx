"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  api,
  CATEGORIES,
  REJECT_REASONS,
  type Place,
  type Staff,
} from "@/lib/api";
import { cn } from "@/lib/cn";

import { useBusiness } from "./shell";

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;
const tints = [
  "bg-mint-strong",
  "bg-[#f4e3d3]",
  "bg-[#e4e8f2]",
  "bg-[#f2e4e8]",
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Good morning"
    : hour < 18
      ? "Good afternoon"
      : "Good evening";
}

export default function DashboardHome() {
  const { business } = useBusiness();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Place[]>(`/businesses/${business.id}/locations`),
      api<Staff[]>(`/businesses/${business.id}/staff`),
    ])
      .then(([p, s]) => {
        setPlaces(p);
        setStaff(s);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "That didn't work."),
      );
  }, [business.id]);

  return (
    <>
      <div className="rise flex flex-col gap-1">
        <p className="text-sm font-semibold text-muted">{greeting()}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {business.name}
        </h1>
        <p className="text-sm font-semibold text-spruce">
          {CATEGORIES[business.category]}
        </p>
      </div>
      <ReviewTracker />
      <FormError message={error} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Checklist
          placeCount={places?.length ?? 0}
          staffCount={staff?.length ?? 0}
        />
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby="places-title"
            className="rise rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
            style={delay(160)}
          >
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
                      Times shown in{" "}
                      {p.timezone.replace("_", " ").split("/").pop()} time
                    </span>
                  </span>
                </li>
              )) ?? <li className="text-muted">Loading…</li>}
            </ul>
          </section>
          <section
            aria-labelledby="team-title"
            className="rise rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
            style={delay(220)}
          >
            <h2 id="team-title" className="text-lg font-bold">
              Team
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {staff?.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      tints[i % tints.length],
                    )}
                  >
                    {initials(s.display_name)}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold">{s.display_name}</span>
                    {s.title && (
                      <span className="text-sm text-muted">{s.title}</span>
                    )}
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
      detail:
        status === "rejected"
          ? "Changes needed"
          : status === "approved"
            ? "Checked by Spruce"
            : "Checking your details",
    },
    {
      label: "Approved",
      detail: status === "approved" ? "You're on Spruce" : "Bookings can open",
    },
  ];

  const headline = {
    pending: "Your business is in review",
    approved: "Your business is approved",
    rejected: "Your business needs a few changes",
    suspended: "Your business is suspended",
  }[status];
  const body = {
    pending:
      "A person on the Spruce team is checking your details. This page updates when they're done.",
    approved:
      "Next you'll add services and opening hours, so customers can book.",
    rejected: "",
    suspended:
      "Your business is hidden from customers. Contact Spruce support to find out why.",
  }[status];

  return (
    <section
      aria-labelledby="review-title"
      className="rise relative overflow-hidden rounded-[32px] bg-forest p-6 text-white sm:p-8"
      style={delay(80)}
    >
      <div
        aria-hidden="true"
        className="absolute -top-24 -right-20 size-72 rounded-full bg-spruce/60 blur-3xl"
      />
      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span
            className={cn(
              "self-start rounded-full px-3 py-1 text-xs font-bold",
              status === "approved"
                ? "bg-leaf text-forest"
                : status === "rejected"
                  ? "bg-[#fbeceb] text-danger"
                  : "bg-[#fbf3e2] text-ink",
            )}
          >
            {
              {
                pending: "In review",
                approved: "Approved",
                rejected: "Not approved",
                suspended: "Suspended",
              }[status]
            }
          </span>
          <h2
            id="review-title"
            className="text-2xl font-bold tracking-tight text-balance sm:text-3xl"
          >
            {headline}
          </h2>
          {body && <p className="max-w-prose text-pretty text-leaf">{body}</p>}
        </div>

        {status !== "suspended" && (
          <ol
            aria-label="Review progress"
            className="grid gap-3 sm:grid-cols-3"
          >
            {stages.map((s, i) => {
              const done = i < reached || (i === 1 && status === "approved");
              const current =
                i === reached - 1 && status !== "approved" && i > 0;
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
                      failed
                        ? "bg-[#fbeceb] text-danger"
                        : done
                          ? "bg-leaf text-forest"
                          : current
                            ? "bg-white text-forest"
                            : "bg-white/10 text-leaf",
                    )}
                  >
                    {failed ? (
                      <Icon
                        name="close"
                        width={16}
                        height={16}
                        strokeWidth={2.4}
                      />
                    ) : done && !current ? (
                      <Icon
                        name="check"
                        width={16}
                        height={16}
                        strokeWidth={2.6}
                        className="pop"
                      />
                    ) : (
                      <>
                        {current && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-0 animate-ping rounded-full bg-white/40"
                          />
                        )}
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
                Reason:{" "}
                {business.rejection_reason
                  ? REJECT_REASONS[business.rejection_reason]
                  : ""}
              </p>
              {business.rejection_note && (
                <p className="text-pretty text-muted">
                  {business.rejection_note}
                </p>
              )}
            </div>
            <FormError message={error} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await api(`/businesses/${business.id}/submit`, {
                      method: "POST",
                    });
                    await reload();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "That didn't work.",
                    );
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
}: {
  placeCount: number;
  staffCount: number;
}) {
  const items = [
    { label: "Business details", done: true },
    { label: "First location", done: placeCount > 0 },
    { label: "First team member", done: staffCount > 0 },
    { label: "Services and prices", done: false, next: true },
    { label: "Opening hours", done: false, next: true },
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
          <svg
            viewBox="0 0 80 80"
            className="size-20 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="40"
              cy="40"
              r={r}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="8"
            />
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
            {doneCount} of {items.length} done. The rest open in the next
            release.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={item.label}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3",
              item.done ? "bg-mint/60" : "",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                item.done
                  ? "bg-spruce text-white"
                  : "border-2 border-dashed border-line-strong",
              )}
            >
              {item.done && (
                <Icon name="check" width={13} height={13} strokeWidth={3} />
              )}
            </span>
            <span
              className={cn(
                "flex-1 text-sm font-semibold",
                !item.done && "text-muted",
              )}
            >
              {item.label}
              <span className="sr-only">
                {item.done ? ", done" : ", not yet available"}
              </span>
            </span>
            {item.next && (
              <span className="text-xs font-semibold text-muted">
                Next release
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
