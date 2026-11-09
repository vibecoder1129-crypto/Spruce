"use client";

import { TakingsReport } from "@/components/takings";

import { useBusiness } from "../shell";

/** Reports (slice 14): takings, tips and commission per team member. */
export function Reports() {
  const { business } = useBusiness();
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 max-w-prose text-muted">
          Takings from visits checked out in the calendar, with tips and each person&apos;s commission. Paid at the
          venue, so these are your own records.
        </p>
      </div>
      <section aria-labelledby="takings-title" className="rise flex flex-col gap-3">
        <h2 id="takings-title" className="text-xl font-bold">
          Takings
        </h2>
        <TakingsReport url={`/businesses/${business.id}/takings`} />
      </section>
    </>
  );
}
