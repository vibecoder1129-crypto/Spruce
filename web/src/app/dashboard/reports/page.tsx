import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <Upcoming
      title="Reports"
      text="Sales, bookings and no-show reports arrive once checkout is live."
    />
  );
}
