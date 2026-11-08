import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Upcoming
      title="Settings"
      text="Opening hours, booking rules and billing arrive in later releases."
    />
  );
}
