"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { FormError } from "@/components/auth-shell";
import { DayBoard } from "@/components/calendar/board";
import { Icon } from "@/components/icons";
import { api, ApiError, type MyStaff } from "@/lib/api";
import { useMe } from "@/lib/use-me";

/** The day board for a staff member. The API scopes it to what their permissions allow. */
export function StaffCalendar() {
  const router = useRouter();
  const { me, error: meError } = useMe("staff");
  const [mine, setMine] = useState<MyStaff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api<MyStaff>("/me/staff")
      .then(setMine)
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?signed-out");
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [me, router]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label="Team" href="/staff" />
      <main
        id="main"
        className="mx-auto flex w-full max-w-[100rem] min-w-0 flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10"
      >
        <Link
          href="/staff"
          className="-mb-6 inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-spruce"
        >
          <Icon name="back" /> Your page
        </Link>
        <FormError message={meError ?? error} />
        {!mine && !(meError ?? error) && <p className="text-muted">Loading…</p>}
        {mine &&
          (mine.permissions.includes("calendar.view") ? (
            <DayBoard businessId={mine.business_id} />
          ) : (
            <p className="text-muted">Your manager hasn&apos;t turned on the calendar for you yet.</p>
          ))}
      </main>
    </div>
  );
}
