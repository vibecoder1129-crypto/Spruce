import type { Metadata } from "next";

import { Wordmark } from "@/components/ui/wordmark";

import { TryAgain } from "./try-again";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

/** Shown by the service worker when a page can't load (slice 11). */
export default function Page() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-5 py-16"
    >
      <Wordmark />
      <h1 className="text-3xl font-bold">You&apos;re offline</h1>
      <p className="text-muted">
        Spruce needs a connection to show your bookings and open times. Check your Wi-Fi or mobile data, then try again.
      </p>
      <p className="text-muted">
        If you were booking, check Your bookings once you&apos;re back to see whether it went through.
      </p>
      <TryAgain />
    </main>
  );
}
