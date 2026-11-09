import type { Metadata } from "next";
import { Suspense } from "react";

import { StopEmailsPage } from "./client";

export const metadata: Metadata = { title: "Stop rebooking reminders" };

// The link's user and token come from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StopEmailsPage />
    </Suspense>
  );
}
