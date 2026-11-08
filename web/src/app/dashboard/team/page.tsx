import type { Metadata } from "next";

import { Upcoming } from "../shell";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return <Upcoming title="Team" text="Inviting your team, their logins and what each person may do arrive with the team release." />;
}
