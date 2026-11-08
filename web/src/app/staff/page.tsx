import type { Metadata } from "next";

import { StaffHome } from "./staff-home";

export const metadata: Metadata = {
  title: "Your team page",
  robots: { index: false },
};

export default function Page() {
  return <StaffHome />;
}
