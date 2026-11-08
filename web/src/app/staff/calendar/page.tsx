import type { Metadata } from "next";

import { StaffCalendar } from "./staff-calendar";

export const metadata: Metadata = {
  title: "Your calendar",
  robots: { index: false },
};

export default function Page() {
  return <StaffCalendar />;
}
