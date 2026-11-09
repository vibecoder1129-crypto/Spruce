"use client";

import { useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, type Business, type SupportState } from "@/lib/api";
import { CANCEL_WINDOWS, policyText } from "@/lib/policy";

import { useBusiness } from "../shell";

function label(hours: number): string {
  return hours === 0 ? "Until the appointment starts" : `Up to ${hours} hours before`;
}

/** Venue rules the owner sets. The API refuses anyone else (business.settings is never grantable). */
export function SettingsPage() {
  const { business, reload, support } = useBusiness();
  const [hours, setHours] = useState(business.cancel_window_hours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api<Business>(`/businesses/${business.id}`, { method: "PATCH", body: { cancel_window_hours: hours } });
      await reload();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const changed = hours !== business.cancel_window_hours;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <form
        onSubmit={save}
        aria-labelledby="policy-title"
        className="rise flex max-w-2xl flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
      >
        <div>
          <h2 id="policy-title" className="text-xl font-bold">
            Cancellation policy
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            How close to the start customers can still cancel or move a booking online. After that they see your contact
            details instead. You can always cancel from the calendar.
          </p>
        </div>
        <Select
          label="Customers can cancel or move"
          value={hours}
          onChange={(e) => {
            setSaved(false);
            setHours(Number(e.target.value));
          }}
        >
          {CANCEL_WINDOWS.map((h) => (
            <option key={h} value={h}>
              {label(h)}
            </option>
          ))}
        </Select>
        <p className="rounded-[var(--radius-control)] bg-ground px-4 py-3 text-sm">
          <span className="font-semibold">Customers will read: </span>
          {policyText(hours)}
        </p>
        <FormError message={error} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy} disabled={!changed}>
            Save policy
          </Button>
          <p role="status" className="text-sm font-semibold text-spruce">
            {saved ? "Saved. New and existing bookings follow it now." : ""}
          </p>
        </div>
      </form>
      {!support && <SupportAccess businessId={business.id} />}
    </>
  );
}

const at = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const until = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

/** Slice 8: let Spruce support set things up, for a while, and see everything they changed. */
function SupportAccess({ businessId }: { businessId: string }) {
  const [state, setState] = useState<SupportState | null>(null);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = !!state?.until;

  // The choice offered next: turning it off while it's on, otherwise a day.
  function show(next: SupportState) {
    setState(next);
    setHours(next.until ? 0 : 24);
  }

  useEffect(() => {
    api<SupportState>(`/businesses/${businessId}/support`)
      .then(show)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't load."));
  }, [businessId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      show(await api<SupportState>(`/businesses/${businessId}/support`, { method: "PUT", body: { hours } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      aria-labelledby="support-title"
      className="rise flex max-w-2xl flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div>
        <h2 id="support-title" className="text-xl font-bold">
          Support access
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Want help setting up? Let Spruce support sign in to your dashboard for a while. They can&apos;t see or change
          your password, two-step login or this setting, and every change they make is listed here.
        </p>
      </div>
      <p role="status" className="rounded-[var(--radius-control)] bg-ground px-4 py-3 text-sm font-semibold">
        {state === null
          ? error
            ? "Couldn't load the current setting."
            : "Loading…"
          : state.until
            ? `On until ${until.format(new Date(state.until))}.`
            : "Off. Support can't sign in."}
      </p>
      <Select label="Allow support" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
        <option value={0}>{on ? "Turn off now" : "Off"}</option>
        <option value={24}>{on ? "24 hours from now" : "For 24 hours"}</option>
        <option value={72}>{on ? "3 days from now" : "For 3 days"}</option>
      </Select>
      <FormError message={error} />
      <div>
        <Button type="submit" loading={busy} disabled={!on && hours === 0}>
          {hours === 0 ? "Turn off support access" : on ? "Set new end time" : "Allow support"}
        </Button>
      </div>
      {state && state.log.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">What support changed</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {state.log.map((entry) => (
              <li key={entry.at + entry.path} className="flex flex-wrap gap-x-3">
                <span className="text-muted">{at.format(new Date(entry.at))}</span>
                <span>
                  {describe(entry.method, entry.path)} <span className="text-muted">by {entry.by}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

/** A plain-words line for a logged request, by what part of the business it touched. */
function describe(method: string, path: string): string {
  const verb = method === "POST" ? "Added" : method === "DELETE" ? "Removed" : "Changed";
  const area = ["services", "staff", "locations", "shifts", "bookings", "time-off", "clients", "permissions"].find(
    (word) => path.includes(`/${word}`),
  );
  return `${verb} ${area ? area.replace("-", " ") : "business details"}`;
}
