"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FormError } from "@/components/auth-shell";
import { PublicHeader } from "@/components/public-header";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  api,
  ApiError,
  formatPrice,
  nextStep,
  parseDate,
  type Me,
  type MyBooking,
  type MyBookings,
  type WaitlistEntry,
} from "@/lib/api";
import { policyText } from "@/lib/policy";

function when(booking: MyBooking): string {
  const [d, t] = booking.start.split("T");
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${date.format(parseDate(d))}, ${t} to ${booking.end.split("T")[1]}`;
}

/** Feature list 2 (Home hub, My Bookings): a customer's upcoming and past bookings. */
export function MyBookingsPage() {
  const router = useRouter();
  const [data, setData] = useState<MyBookings | null>(null);
  const [waiting, setWaiting] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<WaitlistEntry[]>("/me/waitlist")
      .then(setWaiting)
      .catch(() => undefined); // the bookings call below reports a signed-out visit
    api<MyBookings>("/me/bookings")
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [router]);

  // Business accounts have their own home.
  const onMe = useCallback(
    (m: Me | null) => {
      if (m && m.role !== "consumer") router.replace(nextStep(m));
    },
    [router],
  );

  useEffect(load, [load]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader onMe={onMe} />
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Your bookings</h1>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/search">Book something new</ButtonLink>
            <ButtonLink href="/account" variant="secondary">
              Account
            </ButtonLink>
          </div>
        </div>
        <FormError message={error} />
        {notice && (
          <p role="status" className="rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm">
            {notice}
          </p>
        )}
        {!data && !error && <p className="text-muted">Loading…</p>}
        {data && (
          <>
            <section aria-labelledby="upcoming" className="flex flex-col gap-3">
              <h2 id="upcoming" className="text-xl font-bold">
                Upcoming
              </h2>
              {data.upcoming.length === 0 ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6">
                  <p className="font-semibold">Nothing booked yet</p>
                  <p className="mt-1 text-sm text-muted">
                    Find a venue near you and pick a time. You pay at the venue.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.upcoming.map((b) => (
                    <BookingCard
                      key={b.id}
                      booking={b}
                      upcoming
                      onCancelled={() => {
                        setNotice(`Cancelled your ${b.service_name} at ${b.business_name}. We've emailed you.`);
                        load();
                      }}
                      onError={setError}
                    />
                  ))}
                </ul>
              )}
            </section>
            {waiting.length > 0 && (
              <section aria-labelledby="waitlist" className="flex flex-col gap-3">
                <h2 id="waitlist" className="text-xl font-bold">
                  Waitlist
                </h2>
                <ul className="flex flex-col gap-3">
                  {waiting.map((w) => (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {w.service_name} at {w.business_name}
                        </p>
                        <p className="text-sm text-muted">
                          {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(
                            parseDate(w.date),
                          )}
                          {w.notified
                            ? ". A time opened up and we emailed you."
                            : ". We'll email you if a time frees up."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {w.notified && (
                          <ButtonLink
                            href={`/b/${w.business_id}/book?service=${w.service_id}&staff=any&date=${w.date}`}
                          >
                            See times
                          </ButtonLink>
                        )}
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              await api(`/me/waitlist/${w.id}`, { method: "DELETE" });
                              setNotice(`You've left the waitlist for ${w.service_name} at ${w.business_name}.`);
                              load();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "That didn't work.");
                            }
                          }}
                        >
                          Leave<span className="sr-only"> the waitlist for {w.service_name}</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.past.length > 0 && (
              <section aria-labelledby="past" className="flex flex-col gap-3">
                <h2 id="past" className="text-xl font-bold">
                  Past
                </h2>
                <ul className="flex flex-col gap-3">
                  {data.past.map((b) => (
                    <BookingCard key={b.id} booking={b} onCancelled={load} onError={setError} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function BookingCard({
  booking: b,
  upcoming = false,
  onCancelled,
  onError,
}: {
  booking: MyBooking;
  upcoming?: boolean;
  onCancelled: () => void;
  onError: (text: string | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancelled = b.status === "cancelled";
  const locked = upcoming && !b.can_change && (b.status === "confirmed" || b.status === "pending");

  async function cancel() {
    setBusy(true);
    onError(null);
    try {
      await api(`/bookings/${b.id}/cancel`, { method: "PATCH" });
      onCancelled();
    } catch (e) {
      onError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/b/${b.business_id}`} className="font-bold hover:text-spruce">
            {b.business_name}
          </Link>
          <p className={cancelled ? "text-muted line-through" : "font-semibold"}>{when(b)}</p>
        </div>
        {cancelled && <span className="rounded-full bg-line px-3 py-1 text-sm font-semibold">Cancelled</span>}
      </div>
      <p className="text-sm text-muted">
        {b.service_name} with {b.staff_name} · {formatPrice(b.price_minor, b.currency)}, paid at the venue
        <br />
        {b.address} · {b.timezone.replaceAll("_", " ")} time
      </p>
      {upcoming && b.can_change && <p className="text-sm">{policyText(b.cancel_window_hours)}</p>}
      {locked && (
        <p className="rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm">
          {b.cancel_window_hours > 0
            ? `It's less than ${b.cancel_window_hours} hours to the start, so this booking can't be changed online. To cancel or change it, contact ${b.business_name}.`
            : `To cancel or change this booking now, contact ${b.business_name}.`}
        </p>
      )}
      {b.can_change && !asking && (
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            href={`/b/${b.business_id}/book?service=${b.service_id}&staff=${b.staff_id}&date=${b.start.split("T")[0]}&reschedule=${b.id}`}
            variant="secondary"
          >
            Change time
            <span className="sr-only">
              {" "}
              for {b.service_name} at {b.business_name}
            </span>
          </ButtonLink>
          <Button variant="ghost" onClick={() => setAsking(true)}>
            Cancel
            <span className="sr-only">
              {" "}
              {b.service_name} at {b.business_name}
            </span>
          </Button>
        </div>
      )}
      {asking && (
        <div
          role="alertdialog"
          aria-labelledby={`ask-${b.id}`}
          className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-warn-soft p-4"
        >
          <p id={`ask-${b.id}`} className="font-semibold">
            Cancel this booking? The venue gets the time back.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={busy} onClick={cancel} autoFocus>
              Yes, cancel it
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
