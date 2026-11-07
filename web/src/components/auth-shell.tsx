import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Wordmark } from "@/components/ui/wordmark";

export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8 rounded-md">
        <Wordmark className="text-2xl" />
      </Link>
      <main id="main" className="w-full max-w-md">
        <Card className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">{title}</h1>
            {intro && <div className="text-muted">{intro}</div>}
          </div>
          {children}
        </Card>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </main>
    </div>
  );
}

/** Announced to screen readers as soon as it appears. */
export function FormError({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {message && (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
