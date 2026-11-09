"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { api, formatPrice, isoDate, type Takings } from "@/lib/api";

/**
 * Takings, tips and commission per team member for a date range (slice 14). The owner sees
 * everyone (`/businesses/{id}/takings`); a team member with "See their own numbers" sees their
 * own (`/me/takings`). Both ends of the range count, in the venue's local days.
 */
export function TakingsReport({ url, mine = false }: { url: string; mine?: boolean }) {
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Takings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (from: string, to: string) => {
      setBusy(true);
      setError(null);
      try {
        setData(await api<Takings>(`${url}?from=${from}&to=${to}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't work.");
      } finally {
        setBusy(false);
      }
    },
    [url],
  );

  // This month so far, read in the browser so the build never fixes a date.
  useEffect(() => {
    const today = isoDate(new Date());
    const first = `${today.slice(0, 8)}01`;
    api<Takings>(`${url}?from=${first}&to=${today}`)
      .then((d) => {
        setData(d);
        setRange({ from: first, to: today });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [url]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    show(String(form.get("from")), String(form.get("to")));
  }

  function show(from: string, to: string) {
    if (!from || !to) {
      setError("Pick both dates.");
      return;
    }
    if (from > to) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setRange({ from, to });
    void load(from, to);
  }

  /** Quick ranges, in the browser's calendar: today, this week (from Monday), this month, last month. */
  function quick(kind: "today" | "week" | "month" | "last") {
    const now = new Date();
    const today = isoDate(now);
    if (kind === "today") return show(today, today);
    if (kind === "week") {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return show(isoDate(monday), today);
    }
    if (kind === "month") return show(`${today.slice(0, 8)}01`, today);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return show(isoDate(new Date(end.getFullYear(), end.getMonth(), 1)), isoDate(end));
  }

  const money = (minor: number) => (data ? formatPrice(minor, data.currency) : "");

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Quick dates" className="flex flex-wrap gap-2">
        {(
          [
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
            ["last", "Last month"],
          ] as const
        ).map(([kind, label]) => (
          <Button key={kind} variant="ghost" onClick={() => quick(kind)} disabled={busy}>
            {label}
          </Button>
        ))}
      </div>
      {range && (
        <form
          key={`${range.from}-${range.to}`}
          onSubmit={submit}
          noValidate
          aria-label="Dates"
          className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
        >
          <Field label="From" name="from" type="date" defaultValue={range.from} className="min-w-40" />
          <Field label="To" name="to" type="date" defaultValue={range.to} className="min-w-40" />
          <Button type="submit" variant="secondary" loading={busy}>
            Show
          </Button>
        </form>
      )}
      <FormError message={error} />
      {!data && !error && <p className="text-muted">Loading…</p>}
      {data && data.rows.length === 0 && (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-6">
          <p className="font-semibold">No checkouts in these dates</p>
          <p className="mt-1 text-sm text-muted">
            {mine
              ? "Visits you check out show here, with your tips and commission."
              : "Check out a visit from the calendar when it ends, and its takings show here."}
          </p>
        </div>
      )}
      {data && data.rows.length > 0 && (
        <p className="text-sm text-muted">
          Paid, with tips: card {money(data.by_method.card)} · cash {money(data.by_method.cash)} · other{" "}
          {money(data.by_method.other)}. Services leaves tips out; commission is on services only.
        </p>
      )}
      {data && data.rows.length > 0 && (
        // Scrolls sideways on a phone, so it can take keyboard focus.
        <div
          role="region"
          aria-label="Takings table"
          tabIndex={0}
          className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface focus-visible:outline-3 focus-visible:outline-spruce"
        >
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Takings by team member</caption>
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Team member
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Visits
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Services
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Tips
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Commission owed
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.staff_id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-3 font-semibold">
                    {r.display_name}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{r.visits}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.sales_minor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.tips_minor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.commission_minor)}</td>
                </tr>
              ))}
            </tbody>
            {!mine && (
              <tfoot className="border-t-2 border-line-strong bg-ground font-bold">
                <tr>
                  <th scope="row" className="px-4 py-3">
                    Total
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums">{data.totals.visits}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.sales_minor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.tips_minor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.totals.commission_minor)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
