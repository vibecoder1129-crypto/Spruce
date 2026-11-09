"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Wordmark } from "@/components/ui/wordmark";
import { api, nextStep, type Me } from "@/lib/api";

export function OpenApp() {
  const router = useRouter();
  useEffect(() => {
    api<Me>("/me")
      .then((me) => router.replace(nextStep(me)))
      .catch(() => router.replace("/")); // signed out: the home page
  }, [router]);
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-16">
      <Wordmark />
      <p role="status" className="text-sm text-muted">
        Opening Spruce…
      </p>
    </main>
  );
}
