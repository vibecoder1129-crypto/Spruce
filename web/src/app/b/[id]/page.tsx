import type { Metadata } from "next";
import { Suspense } from "react";

import { StorefrontPage } from "./storefront";

export const metadata: Metadata = { title: "Venue" };

// The venue comes from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <StorefrontPage />
    </Suspense>
  );
}
