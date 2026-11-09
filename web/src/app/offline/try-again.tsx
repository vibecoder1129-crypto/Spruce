"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Reloads the page the visitor was opening; the offline page is shown in its place. Also on its own, once back online. */
export function TryAgain() {
  useEffect(() => {
    const back = () => window.location.reload();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      Try again
    </Button>
  );
}
