"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { StorefrontPreview, type PreviewData } from "@/components/storefront-preview";
import { Button, ButtonLink } from "@/components/ui/button";
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
type Draft = Record<string, string>;

const STEPS = [
  { label: "Business", title: "Tell us about your business", intro: "Your name and what you offer, as customers will see them." },
  { label: "Location", title: "Where do customers find you?", intro: "One venue to start. You can add more later." },
  { label: "Team", title: "Who works there?", intro: "The first person customers can book. Team logins come later." },
  { label: "Review", title: "Check and submit", intro: "We check every business before it appears on Spruce." },
] as const;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "That didn't work.";
}

function readForm(form: HTMLFormElement): Draft {
  return Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
}

export function Onboarding() {
  const router = useRouter();
  const { me, error: meError } = useMe("owner");
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [editing, setEditing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    if (next) {
      setState(next);
      setDraft({});
    }
  }

  useEffect(() => {
    if (!me) return;
    fetchState()
      .then((next) => next && setState(next))
      .catch((e: unknown) => setError(errorText(e)));
  }, [me, fetchState]);

  const step = !state?.business || editing ? 0 : !state.places.length ? 1 : !state.staff.length ? 2 : 3;
  const preview = previewOf(state, draft);
  const onDraft = (values: Draft) => setDraft((d) => ({ ...d, ...values }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label="Business setup" />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-14">
        <main id="main" className="flex min-w-0 flex-col gap-8">
          <Steps current={submitted ? 4 : step} canEdit={!!state?.business && !submitted} onEdit={() => setEditing(true)} />
          <FormError message={meError ?? error} />
          {!state ? (
            !(meError ?? error) && <p className="text-muted">Loading…</p>
          ) : submitted ? (
            <Submitted />
          ) : (
            <section key={step} aria-labelledby="step-title" className="slide-in flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">
                  {state.business?.approval_status === "rejected" ? "Fix and resubmit" : `Step ${step + 1} of 4`}
                </p>
                <h1 id="step-title" className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                  {STEPS[step].title}
                </h1>
                <p className="text-pretty text-muted">{STEPS[step].intro}</p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-8">
                {step === 0 && (
                  <BusinessStep
                    business={state.business}
                    onDraft={onDraft}
                    onCancel={state.business ? () => setEditing(false) : undefined}
                    onDone={async () => {
                      setEditing(false);
                      await load();
                    }}
                  />
                )}
                {step === 1 && state.business && (
                  <LocationStep business={state.business} countries={state.countries} me={me} onDraft={onDraft} onDone={load} />
                )}
                {step === 2 && state.business && (
                  <StaffStep business={state.business} places={state.places} onDraft={onDraft} onDone={load} />
                )}
                {step === 3 && state.business && (
                  <ReviewStep state={state} onDone={() => setSubmitted(true)} />
                )}
              </div>
            </section>
          )}
        </main>
        <aside aria-label="Preview" className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
          <div className="flex flex-col gap-4 rounded-[32px] bg-forest p-5 text-white sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">How customers will see you</p>
              <span className="flex items-center gap-1.5 text-xs text-leaf">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-leaf" />
                Live preview
              </span>
            </div>
            <StorefrontPreview data={preview} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function previewOf(state: State | null, draft: Draft): PreviewData {
  const place = state?.places[0];
  const typedAddress = [draft.street, [draft.postal_code, draft.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const team = (state?.staff ?? []).map((s) => ({ name: s.display_name, title: s.title }));
  if (draft.display_name) team.push({ name: draft.display_name, title: draft.title ?? "" });
  return {
    name: draft.name ?? state?.business?.name ?? "",
    category: draft.category ?? state?.business?.category ?? "",
    venue: place?.name ?? draft.venue ?? "",
    address: place?.address_text ?? typedAddress,
    team,
  };
}

function Steps({ current, canEdit, onEdit }: { current: number; canEdit: boolean; onEdit: () => void }) {
  return (
    <ol aria-label="Setup steps" className="flex items-center gap-2 sm:gap-3">
      {STEPS.map((s, i) => {
        const done = i < current;
        const here = i === current;
        const dot = (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300",
              done ? "bg-spruce text-white" : here ? "bg-ink text-white" : "border border-line-strong bg-surface text-muted",
            )}
          >
            {done ? <Icon name="check" width={16} height={16} strokeWidth={2.4} className="pop" /> : i + 1}
          </span>
        );
        const text = (
          <span className={cn("hidden text-sm font-semibold sm:inline", here ? "text-ink" : "text-muted")}>{s.label}</span>
        );
        return (
          <li key={s.label} aria-current={here ? "step" : undefined} className="flex flex-1 items-center gap-2 sm:gap-3">
            {i === 0 && done && canEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="-m-1.5 flex min-h-11 items-center gap-2 rounded-full p-1.5 pr-3 hover:bg-mint sm:gap-3"
              >
                {dot}
                {text}
                <span className="sr-only">: done. Edit business details</span>
              </button>
            ) : (
              <span className="flex items-center gap-2 sm:gap-3">
                {dot}
                {text}
                <span className="sr-only">{done ? ": done" : here ? ": current step" : ""}</span>
              </span>
            )}
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="h-px flex-1 bg-line-strong">
                <span className={cn("block h-px bg-spruce transition-[width] duration-500", done ? "w-full" : "w-0")} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepForm({
  onSubmit,
  onDraft,
  submit,
  secondary,
  children,
}: {
  onSubmit: (values: Draft) => Promise<void>;
  onDraft?: (values: Draft) => void;
  submit: string;
  secondary?: ReactNode;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-5"
      onChange={(e) => onDraft?.(readForm(e.currentTarget))}
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = readForm(event.currentTarget);
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
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={busy}>
          {submit}
          <Icon name="arrow" width={18} height={18} />
        </Button>
        {secondary}
      </div>
    </form>
  );
}

function BusinessStep({
  business,
  onDraft,
  onCancel,
  onDone,
}: {
  business: Business | null;
  onDraft: (values: Draft) => void;
  onCancel?: () => void;
  onDone: () => Promise<void>;
}) {
  const [category, setCategory] = useState(business?.category ?? "");
  return (
    <StepForm
      submit={business ? "Save" : "Continue"}
      onDraft={onDraft}
      secondary={
        onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )
      }
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
        hint="The name on your door, for example Linden Studio."
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">
          What do you offer? <span aria-hidden="true" className="font-normal text-muted">*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "relative flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3.5 text-sm font-semibold transition-[background-color,border-color,box-shadow] duration-200",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-spruce",
                category === value
                  ? "border-spruce bg-mint text-spruce shadow-[var(--shadow-focus-ring)]"
                  : "border-line-strong bg-surface hover:border-muted hover:bg-ground",
              )}
            >
              <input
                type="radio"
                name="category"
                value={value}
                required
                checked={category === value}
                onChange={() => setCategory(value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  category === value ? "border-spruce bg-spruce text-white" : "border-line-strong",
                )}
              >
                {category === value && <Icon name="check" width={10} height={10} strokeWidth={3.5} />}
              </span>
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </StepForm>
  );
}

function LocationStep({
  business,
  countries,
  me,
  onDraft,
  onDone,
}: {
  business: Business;
  countries: Country[];
  me: Me | null;
  onDraft: (values: Draft) => void;
  onDone: () => Promise<void>;
}) {
  // Start from the country whose time zone the owner's browser reported at signup.
  const guess = countries.find((c) => me && c.timezones.includes(me.timezone))?.code ?? "";
  const [code, setCode] = useState(guess);
  const zones = countries.find((c) => c.code === code)?.timezones ?? [];

  return (
    <StepForm
      submit="Find on the map"
      onDraft={onDraft}
      onSubmit={async ({ venue, ...values }) => {
        await api(`/businesses/${business.id}/locations`, {
          method: "POST",
          body: { ...values, name: venue, timezone: values.timezone ?? zones[0] },
        });
        await onDone();
      }}
    >
      <Field label="Venue name" name="venue" required maxLength={80} hint="Helps customers tell your venues apart, for example Old Town." />
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
      <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm text-ink">
        <Icon name="pin" width={18} height={18} className="mt-px shrink-0 text-spruce" />
        We place your venue on the map from this address, so customers nearby can find you.
      </p>
    </StepForm>
  );
}

function StaffStep({
  business,
  places,
  onDraft,
  onDone,
}: {
  business: Business;
  places: Place[];
  onDraft: (values: Draft) => void;
  onDone: () => Promise<void>;
}) {
  return (
    <StepForm
      submit="Continue"
      onDraft={onDraft}
      onSubmit={async (values) => {
        await api(`/businesses/${business.id}/staff`, {
          method: "POST",
          body: { ...values, location_id: values.location_id ?? places[0].id },
        });
        await onDone();
      }}
    >
      <Field
        label="Name customers see"
        name="display_name"
        required
        maxLength={80}
        autoComplete="name"
        hint="If you work there yourself, start with you."
      />
      <Field
        label="Title"
        name="title"
        maxLength={80}
        hint="Optional, for example Senior stylist."
      />
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

function ReviewStep({ state, onDone }: { state: State; onDone: () => void }) {
  const business = state.business!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks: [string, string][] = [
    ["Business", `${business.name} · ${CATEGORIES[business.category]}`],
    [state.places.length > 1 ? "Locations" : "Location", state.places.map((p) => `${p.name}, ${p.address_text}`).join("; ")],
    ["Team", state.staff.map((s) => (s.title ? `${s.display_name} (${s.title})` : s.display_name)).join(", ")],
  ];

  return (
    <div className="flex flex-col gap-6">
      <FormError message={error} />
      <ul className="flex flex-col gap-3">
        {checks.map(([label, value], i) => (
          <li key={label} className="rise flex items-start gap-3" style={{ "--delay": `${i * 80}ms` } as CSSProperties}>
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-mint-strong text-spruce">
              <Icon name="check" width={14} height={14} strokeWidth={2.6} />
            </span>
            <span className="flex flex-col">
              <span className="text-sm text-muted">{label}</span>
              <span className="font-semibold">{value}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-3 rounded-[var(--radius-control)] bg-ground p-4 text-sm text-pretty">
        <Icon name="shield" width={18} height={18} className="mt-px shrink-0 text-spruce" />
        <p>
          A person on the Spruce team checks your details. While we look, your dashboard shows where the review is.
        </p>
      </div>
      <Button
        size="lg"
        loading={busy}
        className="sm:self-start"
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
    </div>
  );
}

function Submitted() {
  return (
    <section aria-labelledby="done-title" className="slide-in flex flex-col items-start gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-8 shadow-[var(--shadow-card)]">
      <span className="pop flex size-14 items-center justify-center rounded-full bg-spruce text-white">
        <Icon name="check" width={28} height={28} strokeWidth={2.4} />
      </span>
      <h1 id="done-title" className="text-3xl font-bold tracking-tight">
        Submitted for review
      </h1>
      <p role="status" className="max-w-prose text-pretty text-muted">
        Thank you. We&apos;ll check your details and your dashboard will show the result.
      </p>
      <ButtonLink href="/dashboard" size="lg">
        Go to your dashboard
        <Icon name="arrow" width={18} height={18} />
      </ButtonLink>
    </section>
  );
}
