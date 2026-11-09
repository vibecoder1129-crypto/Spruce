"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon, type IconName } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { api, ApiError, type Business } from "@/lib/api";
import { cn } from "@/lib/cn";
import { logOut, useMe } from "@/lib/use-me";

const NAV: { href: string; label: string; icon: IconName; soon?: boolean }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
  { href: "/dashboard/team", label: "Team", icon: "team" },
  { href: "/dashboard/services", label: "Services", icon: "services" },
  { href: "/dashboard/clients", label: "Clients", icon: "client" },
  { href: "/dashboard/reports", label: "Reports", icon: "reports", soon: true },
  { href: "/dashboard/reviews", label: "Reviews", icon: "reviews", soon: true },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export const STATUS_LABEL = {
  pending: "In review",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "Suspended",
} as const;

const supportEnds = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

type Ctx = { business: Business; reload: () => Promise<void>; support: boolean };
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/* Phone: a top bar with a menu button. Desktop: the sidebar is always there. */}
      <header className="flex min-h-16 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Link href="/dashboard" className="rounded-md">
          <Wordmark className="text-xl" />
        </Link>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="dashboard-nav"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-semibold hover:bg-mint"
        >
          <Icon name={menuOpen ? "close" : "menu"} />
          Menu
        </button>
      </header>
      <div
        id="dashboard-nav"
        className={cn(
          "flex-col border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:border-r",
          menuOpen ? "slide-in flex border-b" : "hidden",
        )}
      >
        <div className="hidden px-6 pt-6 pb-2 lg:block">
          <Link href="/dashboard" className="rounded-md">
            <Wordmark className="text-2xl" />
          </Link>
        </div>
        {business && (
          <div className="mx-3 mt-3 flex items-center gap-3 rounded-[var(--radius-control)] bg-ground p-3 lg:mt-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-spruce text-sm font-bold text-white">
              {initials(business.name)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold">{business.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 rounded-full",
                    business.approval_status === "approved"
                      ? "bg-spruce"
                      : business.approval_status === "pending"
                        ? "bg-[#c2410c]"
                        : "bg-danger",
                  )}
                />
                {STATUS_LABEL[business.approval_status]}
              </span>
            </span>
          </div>
        )}
        <nav aria-label="Dashboard" className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-semibold transition-colors duration-200",
                      active ? "bg-ink text-white" : "text-ink hover:bg-mint",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn("transition-transform duration-200 group-hover:scale-110", active ? "text-leaf" : "text-muted")}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.soon && (
                      <span className={cn("text-[11px] font-semibold", active ? "text-leaf" : "text-muted")}>Soon</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          <Button
            variant="ghost"
            loading={leaving}
            className="w-full justify-start"
            onClick={async () => {
              setLeaving(true);
              await logOut(router).finally(() => setLeaving(false));
            }}
          >
            Log out
          </Button>
        </div>
      </div>
      <main
        id="main"
        className={cn(
          "mx-auto flex w-full min-w-0 flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10",
          // The day board uses the full width; everything else keeps a readable measure.
          pathname === "/dashboard/calendar" ? "max-w-[100rem]" : "max-w-5xl",
        )}
      >
        {me?.support && business && (
          <section
            aria-label="Support mode"
            className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line-strong bg-warn-soft px-4 py-3 shadow-[var(--shadow-card)]"
          >
            <p className="text-sm">
              <span className="font-semibold">You&apos;re helping {business.name} as Spruce support.</span> Every change
              is logged and the owner can read it.
              {business.support_until && (
                <> Access ends {supportEnds.format(new Date(business.support_until))}.</>
              )}
            </p>
            <Button
              variant="secondary"
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                await logOut(router).finally(() => setLeaving(false));
              }}
            >
              End support and log out
            </Button>
          </section>
        )}
        <FormError message={meError ?? error} />
        {business ? (
          <BusinessContext value={{ business, reload, support: !!me?.support }}>{children}</BusinessContext>
        ) : (
          !(meError ?? error) && <p className="text-muted">Loading…</p>
        )}
      </main>
    </div>
  );
}

/** A section that a later release fills in. It says what it will hold, not a vague "soon". */
export function Upcoming({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <div className="rise flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 p-8">
        <span className="rounded-full bg-mint-strong px-3 py-1 text-xs font-bold text-spruce">Coming next</span>
        <p className="max-w-prose text-pretty text-muted">{text}</p>
        <Link href="/dashboard" className="font-semibold text-spruce underline underline-offset-4">
          Back to Home
        </Link>
      </div>
    </>
  );
}
