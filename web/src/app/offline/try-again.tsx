"use client";

import { Button } from "@/components/ui/button";

/** Reloads the page the visitor was opening; the offline page is shown in its place. */
export function TryAgain() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      Try again
    </Button>
  );
}
