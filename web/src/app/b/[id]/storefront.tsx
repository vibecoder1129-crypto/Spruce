"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { FavoriteButton } from "@/components/marketplace/favorite-button";
import { VenueMap } from "@/components/marketplace/venue-map";
import { PublicHeader } from "@/components/public-header";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  api,
  ApiError,
  CATEGORIES,
  formatDuration,
  formatPrice,
  type Favorite,
  type Me,
  type Storefront,
} from "@/lib/api";
import { policyText } from "@/lib/policy";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** HLD 4.2: a venue's public page with services, team, this week's hours and where it is. */
export function StorefrontPage() {
  const { id } = useParams<{ id: string }>();
  const [store, setStore] = useState<Storefront | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [mapFor, setMapFor] = useState<string | null>(null);

  const onMe = useCallback(
    (m: Me | null) => {
      setMe(m);
      if (m?.role === "consumer") {
        api<Favorite[]>("/me/favorites")
          .then((f) => setSaved(f.some((x) => x.business_id === id)))
          .catch(() => undefined);
      }
    },
    [id],
  );

  useEffect(() => {
    api<Storefront>(`/marketplace/businesses/${id}`)
      .then((s) => {
        setStore(s);
        document.title = `${s.name} · Spruce`;
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(e instanceof Error ? e.message : "That didn't work.");
      });
  }, [id]);

  const groups = new Map<string, Storefront["services"]>();
  for (const s of store?.services ?? []) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader onMe={onMe} />
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
        <Link
          href="/search"
          className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-spruce"
        >
          <Icon name="back" /> All venues
        </Link>
        <FormError message={error} />
        {missing && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
            <h1 className="text-2xl font-bold">This venue isn&apos;t on Spruce right now</h1>
            <p className="mt-1 text-muted">It may have closed its page. Find another venue near you.</p>
          </div>
        )}
        {!store && !missing && !error && <p className="text-muted">Loading…</p>}
        {store && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-spruce">{CATEGORIES[store.category] ?? store.category}</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{store.name}</h1>
                <p className="mt-1 text-muted">
                  {store.locations.map((l) => l.address_text).join(" · ")} · You pay at the venue.
                </p>
                <p className="mt-1 text-sm text-muted">{policyText(store.cancel_window_hours)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/b/${store.id}/book`}>Book now</ButtonLink>
                <FavoriteButton businessId={store.id} name={store.name} me={me} saved={saved} onChange={setSaved} />
              </div>
            </div>

            <section aria-labelledby="services" className="flex flex-col gap-4">
              <h2 id="services" className="text-xl font-bold">
                Services
              </h2>
              {[...groups].map(([category, services]) => (
                <div key={category} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                  <h3 className="mb-2 font-bold">{CATEGORIES[category] ?? category}</h3>
                  <ul className="flex flex-col divide-y divide-line">
                    {services.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <span>
                          <span className="font-semibold">{s.name}</span>
                          <span className="ml-2 text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold">{formatPrice(s.price_minor, s.currency)}</span>
                          {s.staff_ids.length > 0 && (
                            <ButtonLink href={`/b/${store.id}/book?service=${s.id}`} variant="secondary">
                              Book<span className="sr-only"> {s.name}</span>
                            </ButtonLink>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            {store.team.length > 0 && (
              <section aria-labelledby="team" className="flex flex-col gap-4">
                <h2 id="team" className="text-xl font-bold">
                  Team
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {store.team.map((m) => (
                    <li key={m.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
                      <p className="font-semibold">{m.display_name}</p>
                      {m.title && <p className="text-sm text-muted">{m.title}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="where" className="flex flex-col gap-4">
              <h2 id="where" className="text-xl font-bold">
                Hours and address
              </h2>
              {store.locations.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{l.name}</h3>
                      <p className="text-sm text-muted">{l.address_text}</p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-pressed={mapFor === l.id}
                      onClick={() => setMapFor(mapFor === l.id ? null : l.id)}
                    >
                      <Icon name="pin" /> {mapFor === l.id ? "Hide map" : "Show map"}
                    </Button>
                  </div>
                  <table className="w-full max-w-sm text-sm">
                    <caption className="mb-1 text-left font-semibold">
                      This week ({l.timezone.replaceAll("_", " ")} time)
                    </caption>
                    <tbody>
                      {l.hours.map((h) => (
                        <tr key={h.day} className="border-t border-line">
                          <th scope="row" className="py-2 text-left font-medium">
                            {DAYS[h.day]}
                          </th>
                          <td className="py-2 text-right">{h.opens ? `${h.opens} to ${h.closes}` : "Closed"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mapFor === l.id && (
                    <VenueMap
                      pins={[
                        { id: l.id, label: `${store.name}, ${l.name}`, latitude: l.latitude, longitude: l.longitude },
                      ]}
                      label={`Map of ${store.name}, ${l.name}`}
                      className="h-72 overflow-hidden rounded-[var(--radius-control)] border border-line"
                    />
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
