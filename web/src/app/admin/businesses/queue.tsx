"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { initials } from "@/components/storefront-preview";
import { Button } from "@/components/ui/button";
import {
  api,
  CATEGORIES,
  REJECT_REASONS,
  type AdminBusiness,
  type AdminBusinessDetail,
  type ApprovalStatus,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/use-me";

const TABS: { status: ApprovalStatus; label: string }[] = [
  { status: "pending", label: "Waiting" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function ReviewQueue() {
  const { me, error: meError } = useMe("admin");
  const [status, setStatus] = useState<ApprovalStatus>("pending");
  const [rows, setRows] = useState<AdminBusiness[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // On a phone the details sit under the list, so bring them into view.
  function choose(id: string) {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }));
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "That didn't work.");

  useEffect(() => {
    if (me) api<AdminBusiness[]>(`/admin/businesses?status=${status}`).then(setRows).catch(fail);
  }, [me, status]);

  function show(next: ApprovalStatus) {
    setRows(null);
    setSelected(null);
    setStatus(next);
  }

  async function decided(message: string) {
    setNotice(message);
    setSelected(null);
    setRows(await api<AdminBusiness[]>(`/admin/businesses?status=${status}`));
  }

  const current = rows?.find((r) => r.id === selected) ?? null;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Business review</h1>
          <p className="text-muted">Check each new business before customers can find it.</p>
        </div>
        <div role="group" aria-label="Show" className="flex self-start rounded-[var(--radius-control)] bg-line p-1">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              aria-pressed={status === t.status}
              onClick={() => show(t.status)}
              className={cn(
                "min-h-11 rounded-[10px] px-4 text-sm font-semibold transition-[background-color,box-shadow] duration-200",
                status === t.status ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
              )}
            >
              {t.label}
              {status === t.status && rows && <span className="ml-1.5 text-muted">{rows.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <FormError message={meError ?? error} />
      {rows === null ? (
        !(meError ?? error) && <p className="text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rise flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-mint-strong text-spruce">
            <Icon name="check" strokeWidth={2.4} />
          </span>
          <p className="font-semibold">{status === "pending" ? "All caught up" : "Nothing here yet"}</p>
          <p className="text-sm text-muted">
            {status === "pending" ? "New businesses appear here when their owners submit them." : "Decided businesses are listed here."}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ul aria-label="Businesses" className="flex flex-col gap-2">
            {rows.map((b, i) => (
              <li key={b.id} className="rise" style={{ "--delay": `${Math.min(i, 8) * 40}ms` } as CSSProperties}>
                <button
                  type="button"
                  aria-pressed={selected === b.id}
                  onClick={() => choose(b.id)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-[20px] border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200",
                    selected === b.id
                      ? "border-spruce bg-surface shadow-[var(--shadow-focus-ring)]"
                      : "border-line bg-surface hover:-translate-y-px hover:border-line-strong hover:shadow-[var(--shadow-card)]",
                  )}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-mint-strong text-sm font-bold text-spruce">
                    {initials(b.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-bold">{b.name}</span>
                    <span className="text-sm text-muted">
                      {CATEGORIES[b.category]} · {b.location_count} {b.location_count === 1 ? "location" : "locations"} ·{" "}
                      {b.staff_count} {b.staff_count === 1 ? "person" : "people"}
                    </span>
                  </span>
                  {b.submitted_at && <span className="shrink-0 text-xs text-muted">{ago(b.submitted_at)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div ref={detailRef} className="scroll-mt-4 lg:sticky lg:top-6">
            {current ? (
              <Detail key={current.id} summary={current} onDecided={decided} />
            ) : (
              <div className="hidden min-h-64 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-center text-muted lg:flex">
                <Icon name="arrow" className="rotate-180" />
                Choose a business to see its details.
              </div>
            )}
          </div>
        </div>
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        {notice && (
          <p key={notice} className="slide-in pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-float)]">
            <Icon name="check" width={16} height={16} className="text-leaf" />
            {notice}
          </p>
        )}
      </div>
    </>
  );
}

function Detail({ summary, onDecided }: { summary: AdminBusiness; onDecided: (message: string) => Promise<void> }) {
  const [detail, setDetail] = useState<AdminBusinessDetail | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ reason?: string; note?: string }>({});
  const noteId = useId();

  useEffect(() => {
    api<AdminBusinessDetail>(`/admin/businesses/${summary.id}`)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "That didn't work."));
  }, [summary.id]);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "approve") {
        await api(`/admin/businesses/${summary.id}/approve`, { method: "PATCH" });
        await onDecided(`${summary.name} is approved.`);
      } else {
        await api(`/admin/businesses/${summary.id}/reject`, { method: "PATCH", body: { reason, note: note.trim() || null } });
        await onDecided(`${summary.name} is rejected. The owner sees the reason.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(null);
    }
  }

  const pending = summary.approval_status === "pending";

  return (
    <section
      aria-labelledby="detail-title"
      className="slide-in flex flex-col gap-6 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-float)] sm:p-7"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-[var(--tracking-eyebrow)] text-spruce uppercase">{CATEGORIES[summary.category]}</p>
        <h2 id="detail-title" className="text-2xl font-bold tracking-tight">
          {summary.name}
        </h2>
        {summary.submitted_at && <p className="text-sm text-muted">Submitted {when.format(new Date(summary.submitted_at))}</p>}
      </div>
      <FormError message={error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Locations</h3>
          {detail ? (
            <ul className="flex flex-col gap-2">
              {detail.locations.map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <Icon name="pin" width={18} height={18} className="mt-0.5 shrink-0 text-spruce" />
                  <span className="text-sm">
                    <span className="block font-semibold">{p.name}</span>
                    {p.address_text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Team</h3>
          {detail ? (
            <ul className="flex flex-col gap-2">
              {detail.staff.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="flex size-7 items-center justify-center rounded-full bg-mint-strong text-xs font-bold">
                    {initials(s.display_name)}
                  </span>
                  <span>
                    <span className="font-semibold">{s.display_name}</span>
                    {s.title && <span className="text-muted"> · {s.title}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          )}
        </div>
      </div>

      {summary.rejection_reason && (
        <p className="rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm">
          <span className="font-semibold text-danger">{REJECT_REASONS[summary.rejection_reason]}.</span>{" "}
          {summary.rejection_note}
        </p>
      )}

      <SupportAccess summary={summary} onError={setError} />

      {pending && !rejecting && (
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row">
          <Button size="lg" loading={busy === "approve"} onClick={() => act("approve")}>
            <Icon name="check" width={18} height={18} strokeWidth={2.4} />
            Approve
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setRejecting(true)}>
            Reject…
          </Button>
        </div>
      )}

      {pending && rejecting && (
        <form
          noValidate
          className="slide-in flex flex-col gap-4 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            const found = {
              reason: reason ? undefined : "Choose a reason. The owner sees it.",
              note: reason === "other" && !note.trim() ? "With Other, tell the owner what to change." : undefined,
            };
            setProblems(found);
            if (found.reason) e.currentTarget.querySelector<HTMLInputElement>("input[name=reason]")?.focus();
            else if (found.note) document.getElementById(noteId)?.focus();
            else void act("reject");
          }}
        >
          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={problems.reason ? true : undefined}
            aria-describedby={problems.reason ? "reason-error" : undefined}
          >
            <legend className="mb-2 text-sm font-semibold">Why are you rejecting it?</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(REJECT_REASONS).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-200",
                    "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-spruce",
                    reason === value ? "border-danger bg-danger-soft text-danger" : "border-line-strong hover:bg-ground",
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    required
                    checked={reason === value}
                    onChange={() => {
                      setReason(value);
                      setProblems({});
                    }}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
            {problems.reason && (
              <p id="reason-error" className="text-sm font-medium text-danger">
                {problems.reason}
              </p>
            )}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-semibold">
              Note for the owner{reason === "other" ? "" : " (optional)"}
            </label>
            <textarea
              id={noteId}
              rows={3}
              maxLength={500}
              required={reason === "other"}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setProblems((p) => ({ ...p, note: undefined }));
              }}
              placeholder="Tell them what to change."
              aria-invalid={problems.note ? true : undefined}
              aria-describedby={problems.note ? `${noteId}-error` : undefined}
              className={cn(
                "rounded-[var(--radius-control)] border bg-surface px-4 py-3 text-base placeholder:text-muted/70",
                "focus:border-spruce focus:shadow-[var(--shadow-focus-ring)]",
                problems.note ? "border-danger" : "border-line-strong",
              )}
            />
            {problems.note && (
              <p id={`${noteId}-error`} className="text-sm font-medium text-danger">
                {problems.note}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={busy === "reject"}>
              Reject {summary.name}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Slice 8: with the owner's say-so, open their dashboard to help. The API logs every change. */
function SupportAccess({ summary, onError }: { summary: AdminBusiness; onError: (text: string | null) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const until = summary.support_until ? new Date(summary.support_until) : null;
  // Read once on mount: "now" changes every render, and the API decides anyway.
  const [now] = useState(() => Date.now());
  const allowed = until !== null && until.getTime() > now;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-muted">Support access</h3>
      {allowed ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">The owner allows support until {when.format(until)}.</p>
          <Button
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              onError(null);
              try {
                await api(`/admin/businesses/${summary.id}/support`, { method: "POST" });
                router.push("/dashboard");
              } catch (e) {
                onError(e instanceof Error ? e.message : "That didn't work.");
                setBusy(false);
              }
            }}
          >
            Open as support
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Off. The owner can turn it on in their Settings.</p>
      )}
    </div>
  );
}
