"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { api, CATEGORIES, formatDuration, formatPrice, type Service } from "@/lib/api";
import { cn } from "@/lib/cn";

import { useBusiness } from "../shell";

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];

/** "35", "35.5" or "35,50" to cents. Null when it isn't a price. */
function toMinor(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function ServicesPage() {
  const { business } = useBusiness();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchServices = useCallback(() => api<Service[]>(`/businesses/${business.id}/services`), [business.id]);

  useEffect(() => {
    fetchServices()
      .then(setServices)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [fetchServices]);

  async function saved(message: string) {
    setEditing(null);
    setNotice(message);
    setServices(await fetchServices());
  }

  const active = services?.filter((s) => s.active) ?? [];
  const archived = services?.filter((s) => !s.active) ?? [];
  const groups = Object.keys(CATEGORIES)
    .map((key) => [key, active.filter((s) => s.category === key)] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="mt-1 text-muted">What customers can book, how long it takes and what it costs.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Icon name="services" /> Add service
        </Button>
      </div>
      <FormError message={error} />
      {notice && (
        <p
          role="status"
          className="pop rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
        >
          {notice}
        </p>
      )}

      <div className={cn("grid gap-6", editing && "lg:grid-cols-[1fr_22rem]")}>
        <div className="flex min-w-0 flex-col gap-6">
          {services === null && !error && <p className="text-muted">Loading…</p>}
          {services !== null && active.length === 0 && (
            <div className="rise flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
              <h2 className="text-xl font-bold">Add your first service</h2>
              <p className="max-w-prose text-muted">
                Start with what you do most. You can add the rest, and say who on your team does each one, after.
              </p>
              <Button variant="secondary" onClick={() => setEditing("new")}>
                Add a service
              </Button>
            </div>
          )}
          {groups.map(([key, list]) => (
            <section key={key} aria-labelledby={`cat-${key}`} className="rise flex flex-col gap-2">
              <h2 id={`cat-${key}`} className="text-sm font-bold tracking-[var(--tracking-label)] text-muted uppercase">
                {CATEGORIES[key]}
              </h2>
              <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                {list.map((s) => (
                  <li key={s.id} className="border-b border-line last:border-b-0">
                    <ServiceRow
                      service={s}
                      selected={editing !== "new" && editing?.id === s.id}
                      onEdit={() => setEditing(s)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {archived.length > 0 && (
            <details className="rounded-[var(--radius-card)] border border-line bg-surface">
              <summary className="flex min-h-12 cursor-pointer items-center px-5 font-semibold">
                Archived ({archived.length})
              </summary>
              <ul className="border-t border-line">
                {archived.map((s) => (
                  <li key={s.id} className="border-b border-line last:border-b-0">
                    <ServiceRow
                      service={s}
                      selected={editing !== "new" && editing?.id === s.id}
                      onEdit={() => setEditing(s)}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        {editing && (
          <ServicePanel
            key={editing === "new" ? "new" : editing.id}
            businessId={business.id}
            service={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        )}
      </div>
    </>
  );
}

function ServiceRow({ service, selected, onEdit }: { service: Service; selected: boolean; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-pressed={selected}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-200 hover:bg-mint",
        selected && "bg-mint",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{service.name}</span>
        <span className="text-sm text-muted">{formatDuration(service.duration_minutes)}</span>
      </span>
      <span className="font-bold tabular-nums">{formatPrice(service.price_minor, service.currency)}</span>
      <span className="sr-only">Edit</span>
    </button>
  );
}

function ServicePanel({
  businessId,
  service,
  onClose,
  onSaved,
}: {
  businessId: string;
  service: Service | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | undefined>();
  const durations =
    service && !DURATIONS.includes(service.duration_minutes)
      ? [...DURATIONS, service.duration_minutes].sort((a, b) => a - b)
      : DURATIONS;

  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onSaved(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = toMinor(String(form.get("price")));
    if (price === null) {
      setPriceError("Enter a price like 35 or 35.50.");
      return;
    }
    setPriceError(undefined);
    const body = {
      name: String(form.get("name")),
      category: String(form.get("category")),
      duration_minutes: Number(form.get("duration")),
      price_minor: price,
    };
    void run(
      () =>
        service
          ? api(`/services/${service.id}`, { method: "PATCH", body })
          : api(`/businesses/${businessId}/services`, { method: "POST", body }),
      service ? `Saved ${body.name}.` : `Added ${body.name}.`,
    );
  }

  const title = service ? `Edit ${service.name}` : "New service";
  return (
    <section
      aria-labelledby="service-panel-title"
      className="slide-in flex h-fit flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="service-panel-title" className="text-xl font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-mint"
        >
          <Icon name="close" />
          <span className="sr-only">Close</span>
        </button>
      </div>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label="Name" name="name" defaultValue={service?.name} maxLength={80} required autoFocus />
        <Select label="Category" name="category" defaultValue={service?.category ?? "hair"} required>
          {Object.entries(CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Duration" name="duration" defaultValue={service?.duration_minutes ?? 45} required>
          {durations.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
            </option>
          ))}
        </Select>
        <Field
          label="Price"
          name="price"
          inputMode="decimal"
          defaultValue={service ? (service.price_minor / 100).toFixed(2) : ""}
          hint={service ? `In ${service.currency}.` : "In your local currency."}
          error={priceError}
          required
        />
        <Button type="submit" loading={busy}>
          {service ? "Save changes" : "Add service"}
        </Button>
      </form>
      {service && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                api(`/services/${service.id}`, {
                  method: "PATCH",
                  body: { active: !service.active },
                }),
              service.active ? `Archived ${service.name}.` : `Restored ${service.name}.`,
            )
          }
        >
          {service.active ? "Archive" : "Restore"}
        </Button>
      )}
    </section>
  );
}
