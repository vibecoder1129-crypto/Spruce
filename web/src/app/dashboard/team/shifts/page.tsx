import type { Metadata } from "next";

import { RosterPage } from "./roster";

export const metadata: Metadata = { title: "Weekly shifts" };

export default function Page() {
  return <RosterPage />;
}
