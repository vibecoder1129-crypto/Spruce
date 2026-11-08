import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return <Upcoming title="Services" text="Your service menu, with prices, durations and who performs each one, arrives with the team release." />;
}
