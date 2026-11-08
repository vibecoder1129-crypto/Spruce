import type { Metadata } from "next";

import { SearchPageClient } from "./search";

export const metadata: Metadata = {
  title: "Find a venue",
  description: "Salons, spas and studios on Spruce, near you or in your city.",
};

export default function Page() {
  return <SearchPageClient />;
}
