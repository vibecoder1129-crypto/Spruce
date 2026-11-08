import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingFlow } from "./booking-flow";

export const metadata: Metadata = { title: "Book", robots: { index: false } };

// The venue and the choices come from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <BookingFlow />
    </Suspense>
  );
}
