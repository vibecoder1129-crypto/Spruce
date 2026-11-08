"use client";

import { DayBoard } from "@/components/calendar/board";

import { useBusiness } from "../shell";

export function CalendarPage() {
  const { business } = useBusiness();
  return <DayBoard businessId={business.id} />;
}
