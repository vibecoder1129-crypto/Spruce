"use client";

import { useEffect, useId, useRef, useState } from "react";

import { FormError } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, CATEGORIES, REJECT_REASONS, type AdminBusiness, type ApprovalStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/use-me";

const TABS: { status: ApprovalStatus; label: string }[] = [
  { status: "pending", label: "Waiting" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function ReviewQueue() {
  const { me, error: meError } = useMe("admin");
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [rows, setRows] = useState<AdminBusiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminBusiness | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That didn't work.");

  useEffect(() => {
    if (me) api<AdminBusiness[]>(`/admin/businesses?status=${status}`).then(setRows).catch(fail);
  }, [me, status]);

  async function load() {
    setRows(await api<AdminBusiness[]>(`/admin/businesses?status=${status}`));
  }

  function show(next: ApprovalStatus) {
    setRows(null);
    setNotice(null);
    setStatus(next);
  }

  async function approve(b: AdminBusiness) {
    setError(null);
    try {
      await api(`/admin/businesses/${b.id}/approve`, { method: "PATCH" });
      setNotice(`${b.name} is approved.`);
      await load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Business review</h1>
        <p className="text-muted">New businesses wait here until someone approves or rejects them.</p>
      </div>
      <div role="group" aria-label="Show" className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            aria-pressed={status === t.status}
            onClick={() => show(t.status)}
            className={cn(
              "min-h-11 rounded-[var(--radius-control)] border px-4 text-sm font-semibold transition-colors",
              status === t.status
                ? "border-spruce bg-spruce text-white"
                : "border-line-strong bg-surface text-ink hover:bg-mint",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="text-sm font-semibold text-spruce empty:hidden">
        {notice}
      </p>
      <FormError message={meError ?? error} />
      {rows === null ? (
        !(meError ?? error) && <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-muted">
          {status === "pending" ? "Nothing is waiting for review." : "No businesses here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((b) => (
            <li key={b.id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-1">
                  <h2 className="text-lg font-bold">{b.name}</h2>
                  <p className="text-sm text-muted">
                    {CATEGORIES[b.category]} · {b.location_count} {b.location_count === 1 ? "location" : "locations"} ·{" "}
                    {b.staff_count} {b.staff_count === 1 ? "team member" : "team members"}
                  </p>
                  {b.submitted_at && (
                    <p className="text-sm text-muted">Submitted {when.format(new Date(b.submitted_at))}</p>
                  )}
                  {b.rejection_reason && (
                    <p className="text-sm">
                      <Badge tone="danger">{REJECT_REASONS[b.rejection_reason]}</Badge>{" "}
                      {b.rejection_note}
                    </p>
                  )}
                </div>
                {status === "pending" && (
                  <div className="flex gap-2">
                    <Button onClick={() => approve(b)} aria-label={`Approve ${b.name}`}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => setRejecting(b)} aria-label={`Reject ${b.name}`}>
                      Reject
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {rejecting && (
        <RejectDialog
          business={rejecting}
          onClose={() => setRejecting(null)}
          onDone={async () => {
            setNotice(`${rejecting.name} is rejected. The owner sees the reason.`);
            setRejecting(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function RejectDialog({
  business,
  onClose,
  onDone,
}: {
  business: AdminBusiness;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const noteId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-ink/40"
    >
      <form
        className="flex flex-col gap-5 p-6 sm:p-8"
        onSubmit={async (event) => {
          event.preventDefault();
          const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
          setBusy(true);
          setError(null);
          try {
            await api(`/admin/businesses/${business.id}/reject`, {
              method: "PATCH",
              body: { reason, note: note || null },
            });
            await onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "That didn't work.");
            setBusy(false);
          }
        }}
      >
        <h2 id={titleId} className="text-xl font-bold">
          Reject {business.name}
        </h2>
        <FormError message={error} />
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-sm font-semibold">Reason</legend>
          {Object.entries(REJECT_REASONS).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-2 hover:bg-mint">
              <input
                type="radio"
                name="reason"
                value={value}
                required
                checked={reason === value}
                onChange={() => setReason(value)}
                className="size-5 accent-spruce"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={noteId} className="text-sm font-semibold">
            Note for the owner{reason === "other" ? "" : " (optional)"}
          </label>
          <textarea
            id={noteId}
            name="note"
            rows={3}
            maxLength={500}
            required={reason === "other"}
            className="rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 py-3 text-base focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]"
          />
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            Reject
          </Button>
        </div>
      </form>
    </dialog>
  );
}
