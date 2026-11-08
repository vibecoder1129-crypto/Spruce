"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { cn } from "@/lib/cn";

// An example of the four booking taps. No venue, price or rating: those arrive when real
// venues do. Everything here is labelled as an example.
const SERVICES = [
  { id: "cut", label: "Haircut and blow-dry", minutes: 45 },
  { id: "nails", label: "Gel manicure", minutes: 60 },
  { id: "massage", label: "Back and shoulder massage", minutes: 30 },
];
const PROS = ["Any professional", "Senior stylist", "Stylist"];
const TIMES = ["10:00", "10:45", "11:30", "13:15", "14:00", "16:30"];
const STEPS = ["Service", "Professional", "Time", "Confirm"] as const;

export function BookingDemo() {
  const [step, setStep] = useState(0);
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null);
  const [pro, setPro] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setStep(0);
    setService(null);
    setPro(null);
    setTime(null);
    setDone(false);
  }

  const option = (selected: boolean) =>
    cn(
      "flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 text-left text-sm font-semibold transition-[background-color,border-color,transform] duration-200 active:scale-[0.99]",
      selected ? "border-spruce bg-mint text-spruce" : "border-line-strong bg-surface hover:border-muted hover:bg-ground",
    );

  return (
    <div className="flex flex-col gap-5 rounded-[28px] border border-line bg-surface p-5 shadow-[var(--shadow-float)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-mint-strong px-3 py-1 text-xs font-bold text-spruce">Example booking</span>
        <button type="button" onClick={reset} className="min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-spruce hover:bg-mint">
          Start again
        </button>
      </div>
      <ol aria-label="Booking steps" className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step && !done ? "step" : undefined} className="flex flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn("h-1.5 rounded-full transition-colors duration-300", i < step || done ? "bg-spruce" : i === step ? "bg-spruce/50" : "bg-line-strong")}
            />
            <span className={cn("text-xs font-semibold", i === step && !done ? "text-ink" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="min-h-[19rem]">
        {done ? (
          <div className="slide-in flex flex-col items-start gap-4 py-4">
            <span className="pop flex size-14 items-center justify-center rounded-full bg-spruce text-white">
              <Icon name="check" width={28} height={28} strokeWidth={2.4} />
            </span>
            <p className="text-2xl font-bold tracking-tight">That&apos;s it. You&apos;re booked.</p>
            <p className="text-pretty text-muted">
              In the real app you&apos;d get a confirmation and a reminder the day before. You pay at the venue, by card or cash.
            </p>
          </div>
        ) : step === 0 ? (
          <fieldset key="s0" className="slide-in flex flex-col gap-2">
            <legend className="mb-3 text-lg font-bold">What would you like?</legend>
            {SERVICES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={service?.id === s.id}
                className={option(service?.id === s.id)}
                onClick={() => {
                  setService(s);
                  setStep(1);
                }}
              >
                {s.label}
                <span className="font-normal text-muted">{s.minutes} min</span>
              </button>
            ))}
          </fieldset>
        ) : step === 1 ? (
          <fieldset key="s1" className="slide-in flex flex-col gap-2">
            <legend className="mb-3 text-lg font-bold">With whom?</legend>
            {PROS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={pro === p}
                className={option(pro === p)}
                onClick={() => {
                  setPro(p);
                  setStep(2);
                }}
              >
                {p}
                <Icon name="arrow" width={16} height={16} className="text-muted" />
              </button>
            ))}
          </fieldset>
        ) : step === 2 ? (
          <fieldset key="s2" className="slide-in flex flex-col gap-2">
            <legend className="mb-3 text-lg font-bold">Pick a time on Saturday</legend>
            <div className="grid grid-cols-3 gap-2">
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={time === t}
                  className={cn(option(time === t), "justify-center tabular-nums")}
                  onClick={() => {
                    setTime(t);
                    setStep(3);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <div key="s3" className="slide-in flex flex-col gap-4">
            <p className="text-lg font-bold">Check and confirm</p>
            <dl className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
              {[
                ["Service", `${service?.label}, ${service?.minutes} min`],
                ["With", pro],
                ["When", `Saturday at ${time}`],
                ["Payment", "At the venue"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setDone(true)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-button)] bg-spruce px-6 text-sm font-bold tracking-[var(--tracking-label)] text-white uppercase shadow-[var(--shadow-button)] hover:bg-spruce-hover active:scale-[0.98]"
              >
                Confirm booking
              </button>
              <button type="button" onClick={() => setStep(2)} className="min-h-12 rounded-[var(--radius-button)] px-4 text-sm font-semibold text-spruce hover:bg-mint">
                Change time
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
