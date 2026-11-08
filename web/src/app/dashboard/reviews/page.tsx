import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return <Upcoming title="Reviews" text="Reviews from completed bookings arrive with the reviews release." />;
}
