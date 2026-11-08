"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  api,
  FLAGS,
  formatDuration,
  OWNER_ONLY,
  type Flag,
  type Permission,
  type Place,
  type Service,
  type Staff,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useFieldErrors } from "@/lib/form-errors";

import { useBusiness } from "../shell";

type Tab = "details" | "services" | "permissions";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "services", label: "Services" },
  { id: "permissions", label: "Permissions" },
];

function message(e: unknown): string {
  return e instanceof Error ? e.message : "That didn't work.";
}

export function TeamPage() {
  const { business } = useBusiness();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchStaff = useCallback(() => api<Staff[]>(`/businesses/${business.id}/staff`), [business.id]);

  useEffect(() => {
    Promise.all([
      fetchStaff(),
      api<Place[]>(`/businesses/${business.id}/locations`),
      api<Service[]>(`/businesses/${business.id}/services`),
    ])
      .then(([s, p, sv]) => {
        setStaff(s);
        setPlaces(p);
        setServices(sv.filter((x) => x.active));
      })
      .catch((e: unknown) => setError(message(e)));
  }, [business.id, fetchStaff]);

  async function changed(text: string, select?: string | null) {
    setNotice(text);
    setStaff(await fetchStaff());
    if (select !== undefined) setSelected(select);
  }

  const person = staff?.find((s) => s.id === selected) ?? null;
  const placeName = (id: string) => places.find((p) => p.id === id)?.name ?? "";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="mt-1 text-muted">Who works with you, what they do and what they may see.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/dashboard/team/shifts" variant="secondary">
            <Icon name="clock" /> Weekly shifts
          </ButtonLink>
          <Button onClick={() => setSelected("new")}>
            <Icon name="team" /> Add team member
          </Button>
        </div>
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
      <div className={cn("grid gap-6", selected && "lg:grid-cols-[1fr_24rem]")}>
        <ul className="grid h-fit gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {staff === null && !error && <li className="text-muted">Loading…</li>}
          {staff?.map((s) => (
            <li key={s.id} className="rise">
              <button
                type="button"
                aria-pressed={selected === s.id}
                onClick={() => setSelected(s.id)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-[var(--radius-card)] border bg-surface p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-spruce/40",
                  selected === s.id ? "border-spruce shadow-[var(--shadow-focus-ring)]" : "border-line",
                  !s.active && "opacity-70",
                )}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-mint-strong font-bold text-spruce">
                  {initials(s.display_name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-bold">{s.display_name}</span>
                  <span className="truncate text-sm text-muted">
                    {[s.title, placeName(s.location_id)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-xs font-semibold text-muted">
                    {!s.active
                      ? "Archived"
                      : `${s.service_ids.length} ${s.service_ids.length === 1 ? "service" : "services"} · ${s.has_login ? "Can sign in" : "No login yet"}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected === "new" && (
          <NewMember
            businessId={business.id}
            places={places}
            onClose={() => setSelected(null)}
            onAdded={(s) => void changed(`Added ${s.display_name}.`, s.id)}
          />
        )}
        {person && (
          <MemberPanel
            key={person.id}
            person={person}
            places={places}
            services={services}
            onClose={() => setSelected(null)}
            onChanged={(text) => void changed(text)}
          />
        )}
      </div>
    </>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="member-panel-title"
      className="slide-in flex h-fit flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="member-panel-title" className="text-xl font-bold">
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
      {children}
    </section>
  );
}

function NewMember({
  businessId,
  places,
  onClose,
  onAdded,
}: {
  businessId: string;
  places: Place[];
  onClose: () => void;
  onAdded: (s: Staff) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errors, check, clear } = useFieldErrors();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      onAdded(
        await api<Staff>(`/businesses/${businessId}/staff`, {
          method: "POST",
          body: {
            display_name: String(form.get("name")),
            title: String(form.get("title")),
            location_id: String(form.get("location")),
          },
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="New team member" onClose={onClose}>
      <form method="post" noValidate onSubmit={onSubmit} onInput={(e) => clear((e.target as { name?: string }).name ?? "")} className="flex flex-col gap-4">
        <FormError message={error} />
        <Field
          label="Name"
          name="name"
          maxLength={80}
          hint="As customers will see it."
          data-missing="Enter the name customers will see."
          error={errors.name}
          required
          autoFocus
        />
        <Field label="Title" name="title" maxLength={80} placeholder="Stylist" />
        <Select label="Location" name="location" required>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={busy}>
          Add team member
        </Button>
      </form>
    </Panel>
  );
}

function MemberPanel({
  person,
  places,
  services,
  onClose,
  onChanged,
}: {
  person: Staff;
  places: Place[];
  services: Service[];
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("details");

  return (
    <Panel title={person.display_name} onClose={onClose}>
      <div
        role="tablist"
        aria-label={`${person.display_name}'s settings`}
        className="flex rounded-[var(--radius-control)] bg-ground p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = TABS.findIndex((x) => x.id === tab);
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              setTab(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
            className={cn(
              "min-h-11 flex-1 rounded-[calc(var(--radius-control)-4px)] px-2 text-sm font-semibold transition-colors duration-200",
              tab === t.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="slide-in" key={tab}>
        {tab === "details" && <Details person={person} places={places} onChanged={onChanged} />}
        {tab === "services" && <Services person={person} services={services} onChanged={onChanged} />}
        {tab === "permissions" && <Permissions person={person} onChanged={onChanged} />}
      </div>
    </Panel>
  );
}

function Details({ person, places, onChanged }: { person: Staff; places: Place[]; onChanged: (t: string) => void }) {
  const [busy, setBusy] = useState<"save" | "invite" | "archive" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invite = useFieldErrors();
  const details = useFieldErrors();

  async function run(kind: "save" | "invite" | "archive", work: () => Promise<unknown>, text: string) {
    setBusy(kind);
    setError(null);
    try {
      await work();
      onChanged(text);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FormError message={error} />
      {person.active && !person.has_login && (
        <form
          method="post"
          noValidate
          className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-mint p-4"
          onInput={() => invite.clear("email")}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !invite.check(event.currentTarget)) return;
            const email = String(new FormData(event.currentTarget).get("email"));
            void run(
              "invite",
              () =>
                api(`/staff/${person.id}/invite`, {
                  method: "POST",
                  body: { email },
                }),
              `Invite sent to ${person.display_name}. The link works for 7 days.`,
            );
          }}
        >
          <p className="font-semibold">Invite {person.display_name} to sign in</p>
          <Field
            label="Their email"
            name="email"
            type="email"
            autoComplete="off"
            hint="We'll email them a link to set a password. It works for 7 days."
            data-missing="Enter their email to send the invite."
            error={invite.errors.email}
            required
          />
          <Button type="submit" variant="secondary" loading={busy === "invite"}>
            Send invite
          </Button>
        </form>
      )}
      <form
        method="post"
        noValidate
        className="flex flex-col gap-4"
        onInput={(e) => details.clear((e.target as { name?: string }).name ?? "")}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !details.check(event.currentTarget)) return;
          const form = new FormData(event.currentTarget);
          void run(
            "save",
            () =>
              api(`/staff/${person.id}`, {
                method: "PATCH",
                body: {
                  display_name: String(form.get("name")),
                  title: String(form.get("title")),
                  location_id: String(form.get("location")),
                },
              }),
            "Saved.",
          );
        }}
      >
        <Field
          label="Name"
          name="name"
          defaultValue={person.display_name}
          maxLength={80}
          data-missing="Enter the name customers will see."
          error={details.errors.name}
          required
        />
        <Field label="Title" name="title" defaultValue={person.title} maxLength={80} />
        <Select label="Location" name="location" defaultValue={person.location_id} required>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={busy === "save"}>
          Save changes
        </Button>
      </form>
      <Button
        variant="secondary"
        loading={busy === "archive"}
        onClick={() =>
          void run(
            "archive",
            () =>
              api(`/staff/${person.id}`, {
                method: "PATCH",
                body: { active: !person.active },
              }),
            person.active
              ? `Archived ${person.display_name}. They were signed out.`
              : `Restored ${person.display_name}.`,
          )
        }
      >
        {person.active ? "Archive" : "Restore"}
      </Button>
    </div>
  );
}

function Services({
  person,
  services,
  onChanged,
}: {
  person: Staff;
  services: Service[];
  onChanged: (t: string) => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(person.service_ids));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (services.length === 0) {
    return (
      <p className="text-muted">
        Add services first, then choose who does each one.{" "}
        <a href="/dashboard/services" className="font-semibold text-spruce underline underline-offset-4">
          Go to Services
        </a>
      </p>
    );
  }

  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/staff/${person.id}/services`, {
            method: "PUT",
            body: { service_ids: [...chosen] },
          });
          onChanged(`Saved ${person.display_name}'s services.`);
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-muted">Customers can only book {person.display_name} for these.</legend>
        {services.map((s) => (
          <label
            key={s.id}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-line px-4 hover:bg-mint"
          >
            <input
              type="checkbox"
              className="size-5 shrink-0 accent-spruce"
              checked={chosen.has(s.id)}
              onChange={(e) => {
                const next = new Set(chosen);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setChosen(next);
              }}
            />
            <span className="flex-1 font-semibold">{s.name}</span>
            <span className="text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" loading={busy}>
        Save services
      </Button>
    </form>
  );
}

function Permissions({ person, onChanged }: { person: Staff; onChanged: (t: string) => void }) {
  const [flags, setFlags] = useState<Permission[] | null>(null);
  const [confirming, setConfirming] = useState<Flag | null>(null);
  const [busy, setBusy] = useState<Flag | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Permission[]>(`/staff/${person.id}/permissions`)
      .then(setFlags)
      .catch((e: unknown) => setError(message(e)));
  }, [person.id]);

  async function set(flag: Flag, granted: boolean) {
    setBusy(flag);
    setError(null);
    try {
      await api(`/staff/${person.id}/permissions/${flag}`, {
        method: "PUT",
        body: { granted },
      });
      setFlags((list) => list?.map((p) => (p.flag === flag ? { ...p, granted } : p)) ?? null);
      setConfirming(null);
      onChanged(
        granted
          ? `${person.display_name} can now ${FLAGS[flag].label.toLowerCase()}.`
          : `Turned off "${FLAGS[flag].label}". ${person.display_name} was signed out.`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">Everything starts off. Turn on only what {person.display_name} needs.</p>
      <FormError message={error} />
      {flags === null && !error && <p className="text-muted">Loading…</p>}
      <ul className="flex flex-col gap-2">
        {flags?.map((p) => {
          const labelId = `flag-${p.flag}`;
          return (
            <li key={p.flag} className="rounded-[var(--radius-control)] border border-line p-4">
              <div className="flex items-start gap-4">
                <span className="flex flex-1 flex-col gap-0.5">
                  <span id={labelId} className="font-semibold">
                    {FLAGS[p.flag].label}
                  </span>
                  <span id={`${labelId}-meaning`} className="text-sm text-muted">
                    {FLAGS[p.flag].meaning}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.granted}
                  aria-labelledby={labelId}
                  aria-describedby={`${labelId}-meaning`}
                  disabled={busy !== null}
                  onClick={() => (p.granted ? setConfirming(p.flag) : void set(p.flag, true))}
                  className="flex min-h-11 min-w-14 items-center justify-center rounded-full"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative h-7 w-12 rounded-full transition-colors duration-200",
                      p.granted ? "bg-spruce" : "bg-line-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform duration-200",
                        p.granted && "translate-x-5",
                      )}
                    />
                  </span>
                </button>
              </div>
              {confirming === p.flag && (
                <div
                  role="alertdialog"
                  aria-labelledby={`${labelId}-confirm`}
                  className="pop mt-3 flex flex-col gap-3 rounded-[var(--radius-control)] bg-ground p-3"
                >
                  <p id={`${labelId}-confirm`} className="text-sm">
                    Turning this off signs {person.display_name} out of Spruce right away.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" loading={busy === p.flag} onClick={() => void set(p.flag, false)}>
                      Turn off
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      Keep it on
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="rounded-[var(--radius-control)] bg-ground p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Icon name="shield" /> Only you
        </h3>
        <p className="mt-1 text-sm text-muted">These stay with you, whatever someone&apos;s title.</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted">
          {OWNER_ONLY.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
