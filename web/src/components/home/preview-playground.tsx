"use client";

import { useState } from "react";

import { StorefrontPreview } from "@/components/storefront-preview";
import { CATEGORIES } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Lets a business owner type their own name and see their storefront card. Nothing is saved. */
export function PreviewPlayground() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("hair");
  const [city, setCity] = useState("");
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="try-name"
            className="text-sm font-semibold text-white"
          >
            Your business name
          </label>
          <input
            id="try-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example, Linden Studio"
            className="min-h-12 rounded-[var(--radius-control)] border border-white/20 bg-white/10 px-4 text-base text-white placeholder:text-leaf/80 focus:border-leaf focus:bg-white/15"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="try-city"
            className="text-sm font-semibold text-white"
          >
            City
          </label>
          <input
            id="try-city"
            value={city}
            maxLength={60}
            onChange={(e) => setCity(e.target.value)}
            placeholder="For example, Riga"
            className="min-h-12 rounded-[var(--radius-control)] border border-white/20 bg-white/10 px-4 text-base text-white placeholder:text-leaf/80 focus:border-leaf focus:bg-white/15"
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-white">
            What you offer
          </legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIES).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-200",
                  category === value
                    ? "border-leaf bg-leaf text-forest"
                    : "border-white/25 text-white hover:bg-white/10",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-sm text-leaf">
          Nothing you type here is saved or sent anywhere.
        </p>
      </div>
      <StorefrontPreview
        data={{ name, category, venue: "", address: city, team: [] }}
      />
    </div>
  );
}
