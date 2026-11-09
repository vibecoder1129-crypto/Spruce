"use client";

import { useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, type Business } from "@/lib/api";
import { CANCEL_WINDOWS, policyText } from "@/lib/policy";

import { useBusiness } from "../shell";

function label(hours: number): string {
  return hours === 0 ? "Until the appointment starts" : `Up to ${hours} hours before`;
}

/** Venue rules the owner sets. The API refuses anyone else (business.settings is never grantable). */
export function SettingsPage() {
  const { business, reload } = useBusiness();
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
    </>
  );
}
