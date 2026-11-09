"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/app-header";
import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { TakingsReport } from "@/components/takings";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useFieldErrors } from "@/lib/form-errors";
import { addDays, api, ApiError, FLAGS, isoDate, mondayOf, parseDate, type MyStaff, type Shift } from "@/lib/api";
import { useMe } from "@/lib/use-me";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A staff member's own page: their profile, services and permissions (HLD 4.6). */
export function StaffHome() {
  const router = useRouter();
  const { me, error: meError } = useMe("staff");
  const [mine, setMine] = useState<MyStaff | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [monday, setMonday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { errors, check, clear } = useFieldErrors();

  useEffect(() => {
    if (!me) return;
    // The week is read in the browser, never at build time.
    const week = mondayOf(isoDate(new Date()));
    Promise.all([api<MyStaff>("/me/staff"), api<Shift[]>(`/me/shifts?week=${week}`)])
      .then(([m, s]) => {
        setMine(m);
        setShifts(s);
        setMonday(week);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [me, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !check(event.currentTarget)) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      setMine(
        await api<MyStaff>("/me/staff", {
          method: "PATCH",
          body: {
            display_name: String(form.get("name")),
            title: String(form.get("title")),
          },
        }),
      );
      setNotice("Saved.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
      else setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label="Team" />
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <FormError message={meError ?? error} />
        {!mine && !(meError ?? error) && <p className="text-muted">Loading…</p>}
        {mine && (
          <>
            <div className="rise flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-spruce text-xl font-bold text-white">
                {initials(mine.display_name)}
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Hi, {mine.display_name}</h1>
                <p className="text-muted">
                  {mine.business_name} · {mine.location_name}
                </p>
              </div>
            </div>
            {notice && (
              <p
                role="status"
                className="pop rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
              >
                {notice}
              </p>
            )}
            <section
              aria-labelledby="week-title"
              className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="week-title" className="text-lg font-bold">
                  Your week
                </h2>
                {mine.permissions.includes("calendar.view") && (
                  <ButtonLink href="/staff/calendar" variant="secondary">
                    <Icon name="calendar" /> Open calendar
                  </ButtonLink>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {DAYS.map((name, day) => {
                  const shift = shifts.find((s) => s.day === day);
                  return (
                    <li
                      key={name}
                      className={`rounded-[var(--radius-control)] px-3 py-2 text-sm ${shift ? "bg-mint" : "bg-ground text-muted"}`}
                    >
                      <span className="block font-semibold text-ink">
                        {name} {parseDate(addDays(monday, day)).getDate()}
                      </span>
                      {shift ? `${shift.starts}–${shift.ends}` : "Off"}
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-muted">Your manager plans the shifts. Ask them if something needs to change.</p>
            </section>
            {mine.permissions.includes("reports.own") && (
              <section
                aria-labelledby="takings-title"
                className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6"
              >
                <h2 id="takings-title" className="text-lg font-bold">
                  Your takings
                </h2>
                <TakingsReport url="/me/takings" mine />
              </section>
            )}
            <div className="grid gap-6 md:grid-cols-2">
              <section
                aria-labelledby="services-title"
                className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6"
              >
                <h2 id="services-title" className="text-lg font-bold">
                  Your services
                </h2>
                {mine.services.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {mine.services.map((s) => (
                      <li key={s} className="rounded-full bg-mint px-3 py-1.5 text-sm font-semibold text-spruce">
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Your manager hasn&apos;t assigned any services to you yet.</p>
                )}
              </section>
              <section
                aria-labelledby="access-title"
                className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6"
              >
                <h2 id="access-title" className="text-lg font-bold">
                  What you can do
                </h2>
                {mine.permissions.length ? (
                  <ul className="flex flex-col gap-2">
                    {mine.permissions.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Icon name="check" className="mt-0.5 shrink-0 text-spruce" />
                        <span>
                          <span className="font-semibold">{FLAGS[f].label}.</span>{" "}
                          <span className="text-muted">{FLAGS[f].meaning}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Nothing extra yet. Your manager decides what you can see and do.</p>
                )}
              </section>
            </div>
            <section
              aria-labelledby="profile-title"
              className="rise flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6"
            >
              <h2 id="profile-title" className="text-lg font-bold">
                Your profile
              </h2>
              <form
                method="post"
                noValidate
                onSubmit={onSubmit}
                onInput={() => clear("name")}
                className="grid items-start gap-4 sm:grid-cols-2"
              >
                <Field
                  label="Name"
                  name="name"
                  defaultValue={mine.display_name}
                  maxLength={80}
                  hint="As customers see it."
                  data-missing="Enter the name customers see."
                  error={errors.name}
                  required
                />
                <Field
                  label="Title"
                  name="title"
                  defaultValue={mine.title}
                  maxLength={80}
                  hint="Optional, for example Senior stylist."
                />
                <Button type="submit" loading={busy} className="sm:col-span-2 sm:justify-self-start">
                  Save profile
                </Button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
