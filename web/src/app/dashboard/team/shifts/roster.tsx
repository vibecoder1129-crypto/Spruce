"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { addDays, api, clock, isoDate, mondayOf, parseDate, toMinutes, type Shift, type Staff } from "@/lib/api";
import { cn } from "@/lib/cn";

import { useBusiness } from "../../shell";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// 06:00 to 23:45 in 15-minute steps.
const TIMES = Array.from({ length: 72 }, (_, i) => clock(6 * 60 + i * 15));

type Hours = { starts: string; ends: string };
type Week = Record<string, Hours>; // key: `${staffId}:${day}`

function toWeek(shifts: Shift[]): Week {
  return Object.fromEntries(shifts.map((s) => [`${s.staff_id}:${s.day}`, { starts: s.starts, ends: s.ends }]));
}

function weekLabel(monday: string): string {
  const f = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  return `${f.format(parseDate(monday))} to ${f.format(parseDate(addDays(monday, 6)))}`;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "That didn't work.";
}

/** HLD 4.6: dated weekly shifts, owner only. Staff see them but never edit them. */
export function RosterPage() {
  const { business } = useBusiness();
  const thisWeek = mondayOf(isoDate(new Date()));
  const [monday, setMonday] = useState(thisWeek);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [week, setWeek] = useState<Week>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchWeek = useCallback(
    (m: string) => api<Shift[]>(`/businesses/${business.id}/shifts?week=${m}`).then(toWeek),
    [business.id],
  );

  useEffect(() => {
    api<Staff[]>(`/businesses/${business.id}/staff`)
      .then((s) => setStaff(s.filter((x) => x.active)))
      .catch((e: unknown) => setError(message(e)));
  }, [business.id]);

  useEffect(() => {
    fetchWeek(monday)
      .then((w) => {
        setWeek(w);
        setDirty(false);
      })
      .catch((e: unknown) => setError(message(e)));
  }, [fetchWeek, monday]);

  function set(key: string, hours: Hours | null) {
    setDirty(true);
    setNotice(null);
    setWeek((w) => {
      const next = { ...w };
      if (hours) next[key] = hours;
      else delete next[key];
      return next;
    });
  }

  const invalid = Object.entries(week).filter(([, h]) => toMinutes(h.ends) <= toMinutes(h.starts));

  async function copyLastWeek() {
    setError(null);
    try {
      const last = await fetchWeek(addDays(monday, -7));
      setWeek(last);
      setDirty(true);
      setNotice(Object.keys(last).length ? "Copied last week. Save to keep it." : "Last week had no shifts to copy.");
    } catch (e) {
      setError(message(e));
    }
  }

  async function save() {
    if (invalid.length) {
      setError("Each shift has to end after it starts. Fix the highlighted days.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const shifts = Object.entries(week).map(([key, h]) => {
        const [staff_id, day] = key.split(":");
        return { staff_id, day: Number(day), ...h };
      });
      setWeek(
        toWeek(
          await api<Shift[]>(`/businesses/${business.id}/shifts?week=${monday}`, { method: "PUT", body: { shifts } }),
        ),
      );
      setDirty(false);
      setNotice(`Saved the week of ${weekLabel(monday)}.`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-spruce"
          >
            <Icon name="back" /> Team
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Weekly shifts</h1>
          <p className="mt-1 text-muted">
            Who works when, week by week. Bookings only go into these hours. Block time on the calendar for breaks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={copyLastWeek}>
            Copy last week
          </Button>
          <Button onClick={save} loading={busy} disabled={!dirty}>
            Save week
          </Button>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Choose the week"
        className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3"
      >
        {[
          ["This week", thisWeek],
          ["Next week", addDays(thisWeek, 7)],
        ].map(([label, m]) => (
          <Button
            key={m}
            variant={monday === m ? "primary" : "ghost"}
            aria-pressed={monday === m}
            onClick={() => setMonday(m)}
          >
            {label}
          </Button>
        ))}
        <Field
          label="Pick a week"
          type="date"
          value={monday}
          onChange={(e) => e.target.value && setMonday(mondayOf(e.target.value))}
          className="w-44"
        />
        <p className="pb-3 text-sm font-semibold" aria-live="polite">
          {weekLabel(monday)}
          {dirty && <span className="ml-2 font-normal text-muted">Unsaved changes</span>}
        </p>
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

      {staff === null && !error && <p className="text-muted">Loading…</p>}
      {staff?.length === 0 && <p className="text-muted">Add your team first, then plan their shifts here.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        {staff?.map((person) => (
          <section
            key={person.id}
            aria-labelledby={`roster-${person.id}`}
            className="rise rounded-[var(--radius-card)] border border-line bg-surface p-5"
          >
            <h2 id={`roster-${person.id}`} className="mb-3 text-lg font-bold">
              {person.display_name}
            </h2>
            <ul className="flex flex-col divide-y divide-line">
              {DAYS.map((name, day) => {
                const key = `${person.id}:${day}`;
                const hours = week[key];
                const bad = hours && toMinutes(hours.ends) <= toMinutes(hours.starts);
                return (
                  <li key={day} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-24 text-sm font-semibold">{name}</span>
                    <select
                      aria-label={`${person.display_name}, ${name}, starts`}
                      value={hours?.starts ?? ""}
                      onChange={(e) =>
                        set(key, e.target.value ? { starts: e.target.value, ends: hours?.ends ?? "17:00" } : null)
                      }
                      className="min-h-11 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm"
                    >
                      <option value="">Off</option>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {hours && (
                      <>
                        <span aria-hidden="true" className="text-muted">
                          to
                        </span>
                        <select
                          aria-label={`${person.display_name}, ${name}, ends`}
                          aria-invalid={bad || undefined}
                          value={hours.ends}
                          onChange={(e) => set(key, { starts: hours.starts, ends: e.target.value })}
                          className={cn(
                            "min-h-11 rounded-[var(--radius-control)] border bg-surface px-3 text-sm",
                            bad ? "border-danger" : "border-line-strong",
                          )}
                        >
                          {TIMES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        {bad && <span className="text-sm font-medium text-danger">Ends before it starts</span>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
