import type { Metadata } from "next";

import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-step verification" };

export default function VerifyPage() {
  return <VerifyForm />;
}
