"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  api,
  ApiError,
  CATEGORIES,
  type Business,
  type Country,
  type Me,
  type Place,
  type Staff,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/use-me";

type State = { business: Business | null; places: Place[]; staff: Staff[]; countries: Country[] };

const STEPS = ["Business", "Location", "Team", "Review"] as const;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "That didn't work.";
}

function formValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(
    [...new FormData(event.currentTarget)].map(([k, v]) => [k, String(v).trim()]),
  ) as Record<string, string>;
}

export function Onboarding() {
  const router = useRouter();
  const { me, error: meError } = useMe("owner");
  const [state, setState] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async (): Promise<State | null> => {
    const countries = await api<Country[]>("/geo/countries");
    const business = await api<Business>("/businesses/mine").catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (business?.submitted_at && business.approval_status !== "rejected") {
      router.replace("/dashboard");
      return null;
    }
    const [places, staff] = business
      ? await Promise.all([
          api<Place[]>(`/businesses/${business.id}/locations`),
          api<Staff[]>(`/businesses/${business.id}/staff`),
        ])
      : [[], []];
    return { business, places, staff, countries };
  }, [router]);

  async function load() {
    const next = await fetchState();
    if (next) setState(next);
  }

  useEffect(() => {
    if (!me) return;
    fetchState()
      .then((next) => next && setState(next))
      .catch((e: unknown) => setError(errorText(e)));
  }, [me, fetchState]);

  const step = !state?.business || editing ? 0 : !state.places.length ? 1 : !state.staff.length ? 2 : 3;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label="Business setup" />
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">
            {state?.business?.approval_status === "rejected" ? "Fix and resubmit" : "Set up your business"}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {["Tell us about your business", "Where do customers find you?", "Who works there?", "Check and submit"][step]}
          </h1>
        </div>
        <Steps current={step} />
        <FormError message={meError ?? error} />
        {!state ? (
          !(meError ?? error) && <p className="text-muted">Loading…</p>
        ) : (
          <Card className="flex flex-col gap-6 p-6 sm:p-8">
            {step === 0 && (
              <BusinessStep
                business={state.business}
                onDone={async () => {
                  setEditing(false);
                  await load();
                }}
              />
            )}
            {step === 1 && state.business && (
              <LocationStep business={state.business} countries={state.countries} me={me} onDone={load} />
            )}
            {step === 2 && state.business && (
              <StaffStep business={state.business} places={state.places} onDone={load} />
            )}
            {step === 3 && state.business && (
              <ReviewStep state={state} onEdit={() => setEditing(true)} onDone={() => router.push("/dashboard")} />
            )}
          </Card>
        )}
      </main>
    </div>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Setup steps">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className="flex flex-col gap-2">
          <span
            aria-hidden="true"
            className={cn("h-1.5 rounded-full", i < current ? "bg-spruce" : i === current ? "bg-spruce/60" : "bg-line-strong")}
          />
          <span className={cn("text-xs font-semibold sm:text-sm", i === current ? "text-ink" : "text-muted")}>
            {label}
            <span className="sr-only">{i < current ? ", done" : i === current ? ", current step" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepForm({
  onSubmit,
  submit,
  children,
}: {
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submit: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        const values = formValues(event);
        setBusy(true);
        setError(null);
        try {
          await onSubmit(values);
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      {children}
      <Button type="submit" size="lg" loading={busy} className="sm:self-start">
        {submit}
      </Button>
    </form>
  );
}

function BusinessStep({ business, onDone }: { business: Business | null; onDone: () => Promise<void> }) {
  return (
    <StepForm
      submit={business ? "Save" : "Continue"}
      onSubmit={async ({ name, category }) => {
        const body = { name, category };
        if (business) await api(`/businesses/${business.id}`, { method: "PATCH", body });
        else await api("/businesses", { method: "POST", body });
        await onDone();
      }}
    >
      <Field
        label="Business name"
        name="name"
        required
        maxLength={120}
        autoComplete="organization"
        defaultValue={business?.name}
        hint="The name customers see, for example Linden Studio."
      />
      <Select label="What do you offer?" name="category" required defaultValue={business?.category ?? ""}>
        <option value="" disabled>
          Choose a category
        </option>
        {Object.entries(CATEGORIES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
    </StepForm>
  );
}

function LocationStep({
  business,
  countries,
  me,
  onDone,
}: {
  business: Business;
  countries: Country[];
  me: Me | null;
  onDone: () => Promise<void>;
}) {
  // Start from the country whose time zone the owner's browser reported at signup.
  const guess = countries.find((c) => me && c.timezones.includes(me.timezone))?.code ?? "";
  const [code, setCode] = useState(guess);
  const zones = countries.find((c) => c.code === code)?.timezones ?? [];

  return (
    <StepForm
      submit="Continue"
      onSubmit={async (values) => {
        await api(`/businesses/${business.id}/locations`, {
          method: "POST",
          body: { ...values, timezone: values.timezone ?? zones[0] },
        });
        await onDone();
      }}
    >
      <Field label="Venue name" name="name" required maxLength={80} hint="Helps customers tell your venues apart, for example Old Town." />
      <Field label="Street and number" name="street" required maxLength={160} autoComplete="street-address" />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
        <Field label="Postcode" name="postal_code" required maxLength={16} autoComplete="postal-code" />
        <Field label="City" name="city" required maxLength={80} autoComplete="address-level2" />
      </div>
      <Select label="Country" name="country_code" required value={code} onChange={(e) => setCode(e.target.value)}>
        <option value="" disabled>
          Choose a country
        </option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      {zones.length > 1 && (
        <Select label="Time zone" name="timezone" required defaultValue={zones[0]} key={code}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace("_", " ").split("/").pop()}
            </option>
          ))}
        </Select>
      )}
      <p className="text-sm text-muted">We place your venue on the map from this address.</p>
    </StepForm>
  );
}

function StaffStep({ business, places, onDone }: { business: Business; places: Place[]; onDone: () => Promise<void> }) {
  return (
    <StepForm
      submit="Continue"
      onSubmit={async (values) => {
        await api(`/businesses/${business.id}/staff`, {
          method: "POST",
          body: { ...values, location_id: values.location_id ?? places[0].id },
        });
        await onDone();
      }}
    >
      <p className="text-pretty text-muted">
        Add the first person customers can book. If you work there yourself, start with you. Team logins come later.
      </p>
      <Field label="Name customers see" name="display_name" required maxLength={80} autoComplete="name" />
      <Field label="Title" name="title" maxLength={80} hint="Optional, for example Senior stylist." />
      {places.length > 1 && (
        <Select label="Works at" name="location_id" required>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
    </StepForm>
  );
}

function ReviewStep({ state, onEdit, onDone }: { state: State; onEdit: () => void; onDone: () => void }) {
  const business = state.business!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows: [string, ReactNode][] = [
    ["Business", business.name],
    ["Category", CATEGORIES[business.category]],
    [
      state.places.length > 1 ? "Locations" : "Location",
      state.places.map((p) => (
        <span key={p.id} className="block">
          {p.name} <span className="text-muted">· {p.address_text}</span>
        </span>
      )),
    ],
    ["Team", state.staff.map((s) => (s.title ? `${s.display_name} (${s.title})` : s.display_name)).join(", ")],
  ];

  return (
    <div className="flex flex-col gap-6">
      <FormError message={error} />
      <dl className="flex flex-col divide-y divide-line">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-pretty text-muted">
        We check every business before it appears on Spruce. Your dashboard shows where the review is.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api(`/businesses/${business.id}/submit`, { method: "POST" });
              onDone();
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          Submit for review
        </Button>
        <Button size="lg" variant="secondary" onClick={onEdit}>
          Edit business details
        </Button>
      </div>
    </div>
  );
}
