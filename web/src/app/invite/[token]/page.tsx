import type { Metadata } from "next";
import { Suspense } from "react";

import { InvitePage } from "./client";

export const metadata: Metadata = {
  title: "Join your team",
  robots: { index: false },
};

// The token comes from the URL, which is only known per request.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvitePage />
    </Suspense>
  );
}
