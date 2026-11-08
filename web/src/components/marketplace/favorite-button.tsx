"use client";

import { useState } from "react";

import { api, type Me } from "@/lib/api";
import { cn } from "@/lib/cn";

/** Save a venue. Signed-out visitors are sent to log in; only customers have favourites. */
export function FavoriteButton({
  businessId,
  name,
  me,
  saved,
  onChange,
}: {
  businessId: string;
  name: string;
  me: Me | null | undefined;
  saved: boolean;
  onChange: (saved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (me && me.role !== "consumer") return null;
  const cls =
    "flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-mint";
  if (!me) {
    return (
      <a href="/login" className={cls} aria-label={`Log in to save ${name}`}>
        <Heart filled={false} /> Save
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={`Save ${name}`}
      disabled={busy}
      className={cn(cls, saved && "border-spruce bg-mint text-spruce")}
      onClick={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(`/me/favorites/${businessId}`, { method: saved ? "DELETE" : "PUT" });
          onChange(!saved);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heart filled={saved} /> {saved ? "Saved" : "Save"}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0">
      <path
        d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
