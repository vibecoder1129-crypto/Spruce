"use client";

import { useEffect } from "react";

/** Registers the offline-page worker (slice 11). Production only, so development never serves old files. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined); // the site works without it
  }, []);
  return null;
}
