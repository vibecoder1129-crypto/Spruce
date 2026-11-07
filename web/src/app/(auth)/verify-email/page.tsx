import type { Metadata } from "next";
import { Suspense } from "react";

import { VerifyEmailPage } from "./client";

export const metadata: Metadata = { title: "Confirm your email" };

// The token comes from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPage />
    </Suspense>
  );
}
