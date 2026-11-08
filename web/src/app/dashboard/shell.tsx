"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { FormError } from "@/components/auth-shell";
import { api, ApiError, type Business } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/use-me";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/reviews", label: "Reviews" },
  { href: "/dashboard/settings", label: "Settings" },
];

type Ctx = { business: Business; reload: () => Promise<void> };
const BusinessContext = createContext<Ctx | null>(null);

export function useBusiness(): Ctx {
  const ctx = use(BusinessContext);
  if (!ctx) throw new Error("useBusiness needs the dashboard shell");
  return ctx;
}

/** The owner's work area. Owners who haven't finished onboarding are sent back to it. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me, error: meError } = useMe("owner");
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolves to the business, or to null after sending an unfinished owner to onboarding.
  const fetchBusiness = useCallback(async (): Promise<Business | null> => {
    try {
      const b = await api<Business>("/businesses/mine");
      if (b.submitted_at) return b;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
    router.replace("/onboarding");
    return null;
  }, [router]);

  const reload = useCallback(async () => {
    const b = await fetchBusiness();
    if (b) setBusiness(b);
  }, [fetchBusiness]);

  useEffect(() => {
    if (!me) return;
    fetchBusiness()
      .then((b) => b && setBusiness(b))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [me, fetchBusiness]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader label={business?.name} href="/dashboard" />
      <div className="flex flex-1 flex-col lg:flex-row">
        <nav aria-label="Dashboard" className="border-b border-line bg-surface lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:px-3 lg:py-6">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded-[var(--radius-control)] px-4 text-sm font-semibold transition-colors",
                      active ? "bg-mint-strong text-spruce" : "text-muted hover:bg-mint hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main id="main" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
          <FormError message={meError ?? error} />
          {business ? (
            <BusinessContext value={{ business, reload }}>{children}</BusinessContext>
          ) : (
            !(meError ?? error) && <p className="text-muted">Loading…</p>
          )}
        </main>
      </div>
    </div>
  );
}

/** A section that a later release fills in. It says what it will hold, not a vague "soon". */
export function Upcoming({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-8">
        <p className="max-w-prose text-pretty text-muted">{text}</p>
      </div>
    </>
  );
}
