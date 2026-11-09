import type { Metadata } from "next";

import { OpenApp } from "./open-app";

export const metadata: Metadata = { title: "Opening", robots: { index: false } };

/** Where the installed app starts (slice 11): each signed-in person goes to their own home. */
export default function Page() {
  return <OpenApp />;
}
