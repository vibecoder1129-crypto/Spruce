import type { Metadata } from "next";

import { MyBookingsPage } from "./my-bookings";

export const metadata: Metadata = { title: "Your bookings", robots: { index: false } };

export default function Page() {
  return <MyBookingsPage />;
}
