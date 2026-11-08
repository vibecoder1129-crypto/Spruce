"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { PublicHeader } from "@/components/public-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  addDays,
  api,
  ApiError,
  CATEGORIES,
  formatDuration,
  formatPrice,
  parseDate,
  type Availability,
  type Me,
  type MyBooking,
  type MyBookings,
  type Storefront,
} from "@/lib/api";
import { cn } from "@/lib/cn";

const STEPS = ["Service", "Professional", "Time", "Confirm"] as const;
const ANY = "any";

/** Today's date at the venue, as YYYY-MM-DD. */
function venueToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function longDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(parseDate(iso));
}

function plusMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "That didn't work.";
}

/** HLD 4.4: Service → Professional → Time → Confirm, signing in only at Confirm. */
export function BookingFlow() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [store, setStore] = useState<Storefront | null>(null);
  const [missing, setMissing] = useState(false);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [today, setToday] = useState<string | null>(null);
  const [moving, setMoving] = useState<MyBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept with the URL it was made at: Next keeps this page alive, and a later visit is a new booking.
  const [finished, setFinished] = useState<{ booking: MyBooking; at: string } | null>(null);

  const serviceId = params.get("service");
  const staffParam = params.get("staff");
  const day = params.get("date") ?? today;
  const time = params.get("time");
  const pick = params.get("with");
  const rescheduleId = params.get("reschedule");

  const onMe = useCallback((m: Me | null) => setMe(m), []);

  useEffect(() => {
    api<Storefront>(`/marketplace/businesses/${id}`)
      .then((s) => {
        setStore(s);
        setToday(venueToday(s.locations[0]?.timezone ?? "Europe/Riga"));
        document.title = `Book at ${s.name} · Spruce`;
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(message(e));
      });
  }, [id]);

  useEffect(() => {
    if (!rescheduleId || me?.role !== "consumer") return;
    api<MyBookings>("/me/bookings")
      .then((b) => setMoving(b.upcoming.find((x) => x.id === rescheduleId) ?? null))
      .catch(() => undefined);
  }, [rescheduleId, me]);

  const service = store?.services.find((s) => s.id === serviceId) ?? null;
  const team = useMemo(
    () => (service && store ? store.team.filter((m) => service.staff_ids.includes(m.id)) : []),
    [service, store],
  );
  const staff = staffParam === ANY ? ANY : (team.find((m) => m.id === staffParam)?.id ?? null);
  const step = !service ? 0 : !staff ? 1 : !time || !day || !pick ? 2 : 3;
  const here = `/b/${id}/book?${params.toString()}`;
  const done = finished?.at === here ? finished.booking : null;

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setError(null);
    router.push(`/b/${id}/book?${next.toString()}`, { scroll: false });
  }

  if (missing) {
    return (
      <Page onMe={onMe}>
        <h1 className="text-2xl font-bold">This venue isn&apos;t taking bookings on Spruce right now</h1>
        <Link href="/search" className="font-semibold text-spruce underline underline-offset-4">
          Find another venue
        </Link>
      </Page>
    );
  }
  if (!store) {
    return (
      <Page onMe={onMe}>
        <FormError message={error} />
        {!error && <p className="text-muted">Loading…</p>}
      </Page>
    );
  }

  if (done) {
    return (
      <Page onMe={onMe}>
        <div className="pop flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <p className="flex items-center gap-2 text-sm font-semibold text-spruce">
            <Icon name="check" /> {rescheduleId ? "Booking moved" : "Booking confirmed"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">You&apos;re booked at {done.business_name}</h1>
          <Summary booking={done} />
          <p className="text-sm text-muted">We&apos;ve emailed you the details. You pay at the venue.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/bookings">See your bookings</ButtonLink>
            <ButtonLink href={`/b/${id}`} variant="secondary">
              Back to {store.name}
            </ButtonLink>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page onMe={onMe}>
      <div>
        <Link href={`/b/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-spruce">
          <Icon name="back" /> {store.name}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">
          {rescheduleId ? "Change your booking" : "Book an appointment"}
        </h1>
      </div>

      <ol aria-label="Booking steps" className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-full border px-3 font-semibold",
              i === step
                ? "border-ink bg-ink text-white"
                : i < step
                  ? "border-spruce text-spruce"
                  : "border-line text-muted",
            )}
          >
            <span aria-hidden="true">{i < step ? "✓" : i + 1}</span> {label}
          </li>
        ))}
      </ol>

      <FormError message={error} />

      {step === 0 && (
        <section aria-labelledby="pick-service" className="flex flex-col gap-3">
          <h2 id="pick-service" className="text-xl font-bold">
            Choose a service
          </h2>
          <ul className="flex flex-col gap-2">
            {store.services
              .filter((s) => s.staff_ids.length > 0)
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go({ service: s.id, staff: null, time: null, with: null })}
                    className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-3 text-left hover:border-spruce hover:bg-mint"
                  >
                    <span>
                      <span className="block font-semibold">{s.name}</span>
                      <span className="text-sm text-muted">
                        {CATEGORIES[s.category] ?? s.category} · {formatDuration(s.duration_minutes)}
                      </span>
                    </span>
                    <span className="font-semibold">{formatPrice(s.price_minor, s.currency)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {step === 1 && service && (
        <section aria-labelledby="pick-pro" className="flex flex-col gap-3">
          <Chosen
            label="Service"
            value={`${service.name}, ${formatDuration(service.duration_minutes)}`}
            onChange={() => go({ service: null, staff: null, time: null, with: null })}
          />
          <h2 id="pick-pro" className="text-xl font-bold">
            Choose a professional
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              { id: ANY, display_name: "Anyone available", title: "Earliest free time with any of the team" },
              ...team,
            ].map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => go({ staff: m.id, time: null, with: null })}
                  className="flex min-h-14 w-full flex-col justify-center rounded-[var(--radius-card)] border border-line bg-surface px-5 py-3 text-left hover:border-spruce hover:bg-mint"
                >
                  <span className="font-semibold">{m.display_name}</span>
                  {m.title && <span className="text-sm text-muted">{m.title}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 2 && service && staff && day && today && (
        <TimeStep
          businessId={id}
          service={service}
          staff={staff}
          staffName={staff === ANY ? "Anyone available" : (team.find((m) => m.id === staff)?.display_name ?? "")}
          day={day}
          today={today}
          timezone={store.locations[0]?.timezone ?? "Europe/Riga"}
          onDay={(d) => go({ date: d, time: null, with: null })}
          onTime={(t, who) => go({ date: day, time: t, with: who })}
          onChangeService={() => go({ service: null, staff: null, time: null, with: null })}
          onChangeStaff={() => go({ staff: null, time: null, with: null })}
        />
      )}

      {step === 3 && service && day && time && pick && (
        <Confirm
          me={me}
          here={here}
          store={store}
          service={service}
          staffName={team.find((m) => m.id === pick)?.display_name ?? ""}
          day={day}
          time={time}
          moving={rescheduleId}
          movingBooking={moving}
          onBack={() => go({ time: null, with: null })}
          onDone={(booking) => setFinished({ booking, at: here })}
          onTaken={(text) => {
            go({ time: null, with: null });
            setTimeout(() => setError(text), 0);
          }}
          staffId={pick}
        />
      )}
    </Page>
  );
}

function Page({ onMe, children }: { onMe: (m: Me | null) => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader onMe={onMe} />
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function Chosen({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-mint px-4 py-2 text-sm">
      <span>
        <span className="text-muted">{label}: </span>
        <span className="font-semibold">{value}</span>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="min-h-11 px-2 font-semibold text-spruce underline underline-offset-4"
      >
        Change<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

function TimeStep({
  businessId,
  service,
  staff,
  staffName,
  day,
  today,
  timezone,
  onDay,
  onTime,
  onChangeService,
  onChangeStaff,
}: {
  businessId: string;
  service: Storefront["services"][number];
  staff: string;
  staffName: string;
  day: string;
  today: string;
  timezone: string;
  onDay: (d: string) => void;
  onTime: (t: string, who: string) => void;
  onChangeService: () => void;
  onChangeStaff: () => void;
}) {
  const [slots, setSlots] = useState<Availability["slots"] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  useEffect(() => {
    const q = new URLSearchParams({ service_id: service.id, date: day });
    if (staff !== ANY) q.set("staff_id", staff);
    let live = true;
    api<Availability>(`/marketplace/businesses/${businessId}/availability?${q}`)
      .then((a) => live && (setSlots(a.slots), setFailed(null)))
      .catch((e: unknown) => live && setFailed(message(e)));
    return () => {
      live = false;
    };
  }, [businessId, service.id, staff, day]);

  // With "anyone", each time once, with the first person free then.
  const times: { time: string; who: string }[] = [];
  for (const s of slots ?? []) if (!times.some((t) => t.time === s.time)) times.push({ time: s.time, who: s.staff_id });
  const groups = [
    ["Morning", times.filter((t) => t.time < "12:00")],
    ["Afternoon", times.filter((t) => t.time >= "12:00" && t.time < "17:00")],
    ["Evening", times.filter((t) => t.time >= "17:00")],
  ] as const;
  const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <section aria-labelledby="pick-time" className="flex flex-col gap-4">
      <Chosen
        label="Service"
        value={`${service.name}, ${formatDuration(service.duration_minutes)}`}
        onChange={onChangeService}
      />
      <Chosen label="Professional" value={staffName} onChange={onChangeStaff} />
      <h2 id="pick-time" className="text-xl font-bold">
        Choose a time
      </h2>
      <div role="group" aria-label="Day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === day}
            onClick={() => onDay(d)}
            className={cn(
              "min-h-14 min-w-20 shrink-0 rounded-[var(--radius-control)] border px-3 text-sm font-semibold",
              d === day ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-mint",
            )}
          >
            {d === today ? "Today" : dayFormat.format(parseDate(d))}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">
        {longDate(day)}. Times are {timezone.replaceAll("_", " ")} time.
      </p>
      <FormError message={failed} />
      <div aria-live="polite">
        {slots === null && !failed && <p className="text-muted">Finding open times…</p>}
        {slots && times.length === 0 && (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-5 text-muted">
            No open times on this day. Try another day{staff !== ANY ? " or anyone available" : ""}.
          </p>
        )}
        {times.length > 0 && (
          <div className="flex flex-col gap-4">
            {groups.map(
              ([label, list]) =>
                list.length > 0 && (
                  <div key={label} role="group" aria-label={label}>
                    <h3 className="mb-2 text-sm font-semibold text-muted">{label}</h3>
                    <div className="flex flex-wrap gap-2">
                      {list.map((t) => (
                        <button
                          key={t.time}
                          type="button"
                          onClick={() => onTime(t.time, t.who)}
                          className="min-h-11 min-w-20 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 font-semibold hover:border-spruce hover:bg-mint"
                        >
                          {t.time}
                        </button>
                      ))}
                    </div>
                  </div>
                ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Confirm({
  me,
  here,
  store,
  service,
  staffName,
  staffId,
  day,
  time,
  moving,
  movingBooking,
  onBack,
  onDone,
  onTaken,
}: {
  me: Me | null | undefined;
  here: string;
  store: Storefront;
  service: Storefront["services"][number];
  staffName: string;
  staffId: string;
  day: string;
  time: string;
  moving: string | null;
  movingBooking: MyBooking | null;
  onBack: () => void;
  onDone: (b: MyBooking) => void;
  onTaken: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const place = store.locations[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const start = `${day}T${time}`;
      const booking = moving
        ? await api<MyBooking>(`/bookings/${moving}/reschedule`, {
            method: "PATCH",
            body: { start, staff_id: staffId },
          })
        : await api<MyBooking>("/bookings", {
            method: "POST",
            body: {
              service_id: service.id,
              staff_id: staffId,
              start,
              name: String(form.get("name") ?? "").trim(),
              phone: String(form.get("phone") ?? "").trim() || null,
              notes: String(form.get("notes") ?? "").trim(),
            },
          });
      onDone(booking);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /taken|outside|passed/i.test(e.message)) {
        onTaken("Sorry, that time was just taken. Pick another.");
      } else {
        setError(message(e));
        setBusy(false);
      }
    }
  }

  return (
    <section aria-labelledby="confirm" className="flex flex-col gap-5">
      <h2 id="confirm" className="text-xl font-bold">
        {moving ? "Confirm the new time" : "Confirm your booking"}
      </h2>
      <dl className="grid gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:grid-cols-2">
        <Row label="Service" value={`${service.name}, ${formatDuration(service.duration_minutes)}`} />
        <Row label="With" value={staffName} />
        <Row label="When" value={`${longDate(day)}, ${time} to ${plusMinutes(time, service.duration_minutes)}`} />
        <Row label="Where" value={`${store.name}, ${place?.address_text ?? ""}`} />
        <Row label="Price" value={`${formatPrice(service.price_minor, service.currency)}, paid at the venue`} />
        {movingBooking && (
          <Row
            label="Moving from"
            value={`${longDate(movingBooking.start.split("T")[0])}, ${movingBooking.start.split("T")[1]}`}
          />
        )}
      </dl>
      <div>
        <Button variant="ghost" onClick={onBack}>
          <Icon name="back" /> Pick another time
        </Button>
      </div>
      <FormError message={error} />

      {me === undefined && <p className="text-muted">Checking your account…</p>}
      {me === null && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-mint p-5">
          <p className="font-semibold">Log in or create a free account to confirm. We&apos;ll bring you back here.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/login?next=${encodeURIComponent(here)}`}>Log in to book</ButtonLink>
            <ButtonLink href={`/signup?next=${encodeURIComponent(here)}`} variant="secondary">
              Create an account
            </ButtonLink>
          </div>
        </div>
      )}
      {me && me.role !== "consumer" && (
        <p className="rounded-[var(--radius-control)] bg-warn-soft p-4 text-sm">
          You&apos;re signed in with a business account. Log in with a customer account to book.
        </p>
      )}
      {me?.role === "consumer" && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!moving && (
            <>
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                hint="The venue sees this on their calendar."
                required
                maxLength={120}
              />
              <Field
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                hint="Optional. Only the venue sees it, in case plans change."
              />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="notes" className="text-sm font-semibold">
                  Note for the venue <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base hover:border-muted focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]"
                />
              </div>
            </>
          )}
          <Button type="submit" size="lg" loading={busy} className="self-start">
            {moving ? "Move booking" : "Confirm booking"}
          </Button>
        </form>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Summary({ booking }: { booking: MyBooking }) {
  const [d, t] = booking.start.split("T");
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Row label="Service" value={`${booking.service_name} with ${booking.staff_name}`} />
      <Row label="When" value={`${longDate(d)}, ${t} to ${booking.end.split("T")[1]}`} />
      <Row label="Where" value={`${booking.business_name}, ${booking.address}`} />
      <Row label="Price" value={formatPrice(booking.price_minor, booking.currency)} />
    </dl>
  );
}
