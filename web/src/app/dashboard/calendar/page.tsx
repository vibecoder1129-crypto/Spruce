import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <Upcoming title="Calendar" text="Your team's day board, with shifts, time off and every booking, arrives with the calendar release." />;
}
