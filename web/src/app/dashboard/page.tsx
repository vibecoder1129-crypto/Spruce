"use client";

import { useEffect, useState } from "react";

import { FormError } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, CATEGORIES, REJECT_REASONS, type Place, type Staff } from "@/lib/api";

import { useBusiness } from "./shell";

export default function DashboardHome() {
  const { business } = useBusiness();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Place[]>(`/businesses/${business.id}/locations`),
      api<Staff[]>(`/businesses/${business.id}/staff`),
    ])
      .then(([p, s]) => {
        setPlaces(p);
        setStaff(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [business.id]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">
          {CATEGORIES[business.category]}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{business.name}</h1>
      </div>
      <ReviewStatus />
      <FormError message={error} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{places && places.length > 1 ? "Locations" : "Location"}</h2>
          <ul className="flex flex-col gap-3">
            {places?.map((p) => (
              <li key={p.id}>
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-sm text-muted">{p.address_text}</span>
              </li>
            )) ?? <li className="text-muted">Loading…</li>}
          </ul>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Team</h2>
          <ul className="flex flex-col gap-3">
            {staff?.map((s) => (
              <li key={s.id}>
                <span className="block font-semibold">{s.display_name}</span>
                {s.title && <span className="block text-sm text-muted">{s.title}</span>}
              </li>
            )) ?? <li className="text-muted">Loading…</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

function ReviewStatus() {
  const { business, reload } = useBusiness();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (business.approval_status === "approved") {
    return (
      <Card className="flex flex-col gap-3 border-transparent bg-mint">
        <Badge tone="spruce" className="self-start bg-surface">
          Approved
        </Badge>
        <p className="text-pretty">
          Your business is approved. Next you&apos;ll add services and opening hours, so customers can book.
        </p>
      </Card>
    );
  }

  if (business.approval_status === "rejected") {
    const reason = business.rejection_reason ? REJECT_REASONS[business.rejection_reason] : "";
    return (
      <Card className="flex flex-col gap-4 border-transparent bg-danger-soft">
        <Badge tone="danger" className="self-start bg-surface">
          Not approved
        </Badge>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">Reason: {reason}</p>
          {business.rejection_note && <p className="text-pretty">{business.rejection_note}</p>}
        </div>
        <FormError message={error} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(`/businesses/${business.id}/submit`, { method: "POST" });
                await reload();
              } catch (e) {
                setError(e instanceof Error ? e.message : "That didn't work.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Resubmit for review
          </Button>
          <ButtonLink href="/onboarding" variant="secondary">
            Edit details first
          </ButtonLink>
        </div>
      </Card>
    );
  }

  if (business.approval_status === "suspended") {
    return (
      <Card className="flex flex-col gap-3 border-transparent bg-warn-soft">
        <Badge tone="warn" className="self-start bg-surface">
          Suspended
        </Badge>
        <p className="text-pretty">Your business is hidden from customers. Contact Spruce support to find out why.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 border-transparent bg-warn-soft">
      <Badge tone="warn" className="self-start bg-surface">
        In review
      </Badge>
      <p className="text-pretty">
        We&apos;re checking your details. Customers can find you once your business is approved, and this page
        will say so.
      </p>
    </Card>
  );
}
