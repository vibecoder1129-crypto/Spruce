import type { Metadata } from "next";

import { ReviewQueue } from "./queue";

export const metadata: Metadata = { title: "Business review" };

export default function BusinessReviewPage() {
  return <ReviewQueue />;
}
