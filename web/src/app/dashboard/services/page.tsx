import type { Metadata } from "next";

import { ServicesPage } from "./services";

export const metadata: Metadata = { title: "Services" };

export default function Page() {
  return <ServicesPage />;
}
