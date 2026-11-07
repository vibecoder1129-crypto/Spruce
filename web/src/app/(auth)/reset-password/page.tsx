import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordPage } from "./client";

export const metadata: Metadata = { title: "Choose a new password" };

// The token comes from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPage />
    </Suspense>
  );
}
