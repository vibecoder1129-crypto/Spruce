import type { Metadata } from "next";

import { Onboarding } from "./onboarding";

export const metadata: Metadata = {
  title: "Set up your business",
  robots: { index: false },
};

export default function OnboardingPage() {
  return <Onboarding />;
}
