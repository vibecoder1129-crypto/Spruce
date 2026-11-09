"use client";

import { useSyncExternalStore } from "react";

function subscribe(changed: () => void) {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
}

/** Says so when the connection drops mid-use (slice 11). Nothing shows while online. */
export function OfflineBar() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 bg-ink px-5 py-3 text-center text-sm font-semibold text-white"
    >
      You&apos;re offline. Some things won&apos;t load until you&apos;re back online.
    </p>
  );
}
