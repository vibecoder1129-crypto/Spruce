"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { FavoriteButton } from "@/components/marketplace/favorite-button";
import { VenueMap } from "@/components/marketplace/venue-map";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  api,
  CATEGORIES,
  formatPrice,
  type City,
  type Favorite,
  type Me,
  type SearchPage,
  type SearchResult,
} from "@/lib/api";
import { cn } from "@/lib/cn";

const RADII = [10, 25, 50, 60];
type Point = { lat: number; lng: number };

function placeKey(c: Pick<City, "country_code" | "city">) {
  return `${c.country_code}|${c.city}`;
}

/** HLD 4.1-4.2: search near you or in a city, by category or name, with distance on each card. */
export function SearchPageClient() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState("");
  const [radius, setRadius] = useState(25);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMe = useCallback((m: Me | null) => {
    setMe(m);
    if (m?.role === "consumer") {
      api<Favorite[]>("/me/favorites")
        .then((f) => setSaved(new Set(f.map((x) => x.business_id))))
        .catch(() => undefined);
    }
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (point) {
      params.set("lat", point.lat.toFixed(5));
      params.set("lng", point.lng.toFixed(5));
      params.set("radius_km", String(radius));
    }
    if (place) {
      const [country, city] = place.split("|");
      params.set("country", country);
      if (city) params.set("city", city);
    }
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    return params.toString();
  }, [point, radius, place, category, q]);

  useEffect(() => {
    api<City[]>("/marketplace/cities")
      .then(setCities)
      .catch(() => undefined);
    // Auto-detect only when the visitor already allowed it; otherwise they press the button.
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") locate();
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api<SearchPage>(`/marketplace/search?${query}`)
      .then((r) => {
        setResults(r.results);
        setPage(0);
        setHasMore(r.has_more);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [query]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("This browser can't share your location. Pick a city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPlace("");
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("We couldn't get your location. Pick a city instead.");
      },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  async function more() {
    const next = page + 1;
    const r = await api<SearchPage>(`/marketplace/search?${query}&page=${next}`);
    setResults((list) => [...(list ?? []), ...r.results]);
    setPage(next);
    setHasMore(r.has_more);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQ(String(new FormData(event.currentTarget).get("q") ?? "").trim());
  }

  const countries = [...new Set(cities.map((c) => c.country_code))];
  const where = point ? `within ${radius} km of you` : place ? `in ${place.split("|")[1] || place.split("|")[0]}` : "";
  const pins = useMemo(
    () =>
      (results ?? []).map((r) => ({
        id: r.location_id,
        label: r.business_name,
        latitude: r.latitude,
        longitude: r.longitude,
        href: `/b/${r.business_id}`,
      })),
    [results],
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PublicHeader onMe={onMe} />
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Find a venue</h1>
          <p className="mt-1 text-muted">Salons, spas and studios on Spruce. You pay at the venue.</p>
        </div>

        <section
          aria-label="Search"
          className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-end gap-3">
            <Button
              variant={point ? "primary" : "secondary"}
              loading={locating}
              onClick={locate}
              aria-pressed={!!point}
            >
              <Icon name="pin" /> {point ? "Near you" : "Use my location"}
            </Button>
            <Select
              label="Or choose a place"
              value={place}
              onChange={(e) => {
                setPlace(e.target.value);
                if (e.target.value) setPoint(null);
              }}
              className="w-56"
            >
              <option value="">Anywhere</option>
              {countries.map((country) => (
                <optgroup
                  key={country}
                  label={new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country}
                >
                  <option value={`${country}|`}>
                    All of {new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country}
                  </option>
                  {cities
                    .filter((c) => c.country_code === country)
                    .map((c) => (
                      <option key={placeKey(c)} value={placeKey(c)}>
                        {c.city} ({c.count})
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
            <Select
              label="Distance"
              value={radius}
              disabled={!point}
              hint={point ? undefined : "Use your location first."}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-36"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </Select>
            <form role="search" onSubmit={onSearch} className="flex min-w-0 flex-1 items-end gap-2">
              <Field
                label="Venue or service"
                name="q"
                type="search"
                placeholder="Haircut, massage…"
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Category</legend>
            <div className="flex flex-wrap gap-2">
              {[["", "All"], ...Object.entries(CATEGORIES)].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={category === key}
                  onClick={() => setCategory(key)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                    category === key ? "border-ink bg-ink text-white" : "border-line-strong bg-surface hover:bg-mint",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <FormError message={error} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm font-semibold">
            {results === null
              ? "Searching…"
              : `${results.length}${hasMore ? "+" : ""} ${results.length === 1 ? "venue" : "venues"} ${where}`.trim()}
          </p>
          {results && results.length > 0 && (
            <Button variant="ghost" aria-pressed={showMap} onClick={() => setShowMap((s) => !s)}>
              <Icon name="pin" /> {showMap ? "Hide map" : "Show map"}
            </Button>
          )}
        </div>

        {showMap && results && results.length > 0 && (
          <VenueMap
            pins={pins}
            label="Map of the venues found"
            className="h-80 overflow-hidden rounded-[var(--radius-card)] border border-line sm:h-[28rem]"
          />
        )}

        {results?.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
            <h2 className="text-lg font-bold">No venues here yet</h2>
            <p className="mt-1 max-w-prose text-muted">
              Spruce is opening city by city. Try a wider distance, another category, or{" "}
              <button
                type="button"
                className="font-semibold text-spruce underline underline-offset-4"
                onClick={() => {
                  setPoint(null);
                  setPlace("");
                  setCategory("");
                  setQ("");
                }}
              >
                show everywhere
              </button>
              .
            </p>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results?.map((r) => (
            <li
              key={r.location_id}
              className="rise flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-shadow hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">
                    <Link href={`/b/${r.business_id}`} className="underline-offset-4 hover:underline">
                      {r.business_name}
                    </Link>
                  </h2>
                  <p className="text-sm font-semibold text-spruce">{CATEGORIES[r.category] ?? r.category}</p>
                </div>
                <FavoriteButton
                  businessId={r.business_id}
                  name={r.business_name}
                  me={me}
                  saved={saved.has(r.business_id)}
                  onChange={(on) =>
                    setSaved((s) => {
                      const next = new Set(s);
                      if (on) next.add(r.business_id);
                      else next.delete(r.business_id);
                      return next;
                    })
                  }
                />
              </div>
              <p className="text-sm text-muted">
                {r.location_name} · {r.city}
              </p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
                {r.distance_km !== null && (
                  <span className="flex items-center gap-1 font-semibold">
                    <Icon name="pin" width={16} height={16} /> {r.distance_km.toFixed(1)} km away
                  </span>
                )}
                <span>From {formatPrice(r.from_price_minor, r.currency)}</span>
              </div>
            </li>
          ))}
        </ul>
        {hasMore && (
          <Button variant="secondary" className="self-center" onClick={more}>
            Show more
          </Button>
        )}
      </main>
    </div>
  );
}
