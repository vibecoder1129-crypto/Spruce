"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { logOut } from "@/lib/use-me";

/** The top bar of signed-in work areas: wordmark, an optional label, and log out. */
export function AppHeader({
  label,
  href = "/",
  children,
}: {
  label?: string;
  href?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <header className="flex min-h-16 items-center gap-4 border-b border-line bg-surface px-4 sm:px-6">
      <Link href={href} className="rounded-md">
        <Wordmark className="text-xl" />
      </Link>
      {label && (
        <span className="hidden text-xs font-bold tracking-[var(--tracking-eyebrow)] text-muted uppercase sm:inline">
          {label}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button
          variant="ghost"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await logOut(router).finally(() => setBusy(false));
          }}
        >
          Log out
        </Button>
      </div>
    </header>
  );
}
