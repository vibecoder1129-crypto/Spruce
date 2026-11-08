import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Wordmark } from "@/components/ui/wordmark";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false },
};

const swatches = [
  ["ground", "bg-ground"],
  ["surface", "bg-surface"],
  ["line", "bg-line"],
  ["ink", "bg-ink"],
  ["muted", "bg-muted"],
  ["spruce", "bg-spruce"],
  ["mint", "bg-mint-strong"],
  ["danger", "bg-danger"],
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`s-${title}`} className="flex flex-col gap-4">
      <h2
        id={`s-${title}`}
        className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-muted"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystem() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-12"
    >
      <div className="flex flex-col gap-3">
        <Wordmark className="text-3xl" />
        <h1 className="text-3xl font-bold">Design system</h1>
        <p className="max-w-xl text-muted">
          Every screen in Spruce is built from these pieces. Each one is checked
          for contrast, keyboard use and screen-reader labels in CI.
        </p>
      </div>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map(([name, cls]) => (
            <li key={name} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`size-10 rounded-xl border border-line ${cls}`}
              />
              <span className="text-sm font-medium">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="text-5xl font-bold leading-tight">
            Book your wellness rituals.
          </p>
          <p className="text-2xl font-semibold">Pick a time</p>
          <p className="text-base">Women’s cut &amp; blow-dry · 60 min · €48</p>
          <p className="text-sm text-muted">
            Pay at the venue. Free cancellation up to 24 hours before.
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Book now</Button>
          <Button variant="secondary">Message</Button>
          <Button variant="ghost">View all</Button>
          <Button variant="danger">Cancel booking</Button>
          <Button loading>Saving</Button>
          <Button disabled>Continue</Button>
          <Button size="lg">Continue</Button>
        </div>
      </Section>

      <Section title="Form fields">
        <Card className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
          <Field
            label="Business name"
            hint="This is how customers will find you."
          />
          <Field
            label="Phone"
            type="tel"
            autoComplete="tel"
            error="Enter a phone number with country code, like +371."
          />
        </Card>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          <Badge>Pending</Badge>
          <Badge tone="spruce">Confirmed</Badge>
          <Badge tone="warn">Awaiting approval</Badge>
          <Badge tone="danger">No-show</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card className="flex max-w-sm items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-mint-strong font-semibold text-spruce"
          >
            E
          </span>
          <div className="flex flex-col">
            <span className="font-semibold">Women’s cut &amp; blow-dry</span>
            <span className="text-sm text-muted">
              With Elīna · 60 min · €48
            </span>
          </div>
        </Card>
      </Section>
    </main>
  );
}
