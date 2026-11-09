"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { api, nextStep, type Me } from "@/lib/api";

/** Header for public marketplace pages: the visitor may or may not be signed in. */
export function PublicHeader({ onMe }: { onMe?: (me: Me | null) => void }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api<Me>("/me")
      .then((m) => {
        setMe(m);
        onMe?.(m);
      })
      .catch(() => {
        setMe(null);
        onMe?.(null);
      });
  }, [onMe]);

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
      <Link href="/" className="rounded-md">
        <Wordmark className="text-xl" />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link href="/search" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold hover:text-spruce">
          Find a venue
        </Link>
        {me === null && (
          <ButtonLink href="/login" variant="secondary">
            Log in
          </ButtonLink>
        )}
        {me && (
          <ButtonLink href={nextStep(me)} variant="secondary">
            {me.role === "consumer" ? "Your bookings" : "Your account"}
          </ButtonLink>
        )}
      </nav>
    </header>
  );
}
