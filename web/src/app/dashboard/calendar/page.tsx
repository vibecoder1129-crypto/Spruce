import type { Metadata } from "next";

import { CalendarPage } from "./calendar";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <CalendarPage />;
}
