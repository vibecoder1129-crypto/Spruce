import type { Metadata } from "next";
import { Suspense } from "react";

import { VisitFormPage } from "./visit-form";

export const metadata: Metadata = { title: "Before your visit", robots: { index: false } };

// The booking comes from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VisitFormPage />
    </Suspense>
  );
}
