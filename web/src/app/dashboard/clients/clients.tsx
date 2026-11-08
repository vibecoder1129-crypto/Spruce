"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";

import { FormError } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { api, type Client, type ImportResult } from "@/lib/api";
import { guessColumns, parseCsv, toClient, type ClientField } from "@/lib/csv";

import { useBusiness } from "../shell";

const MAX_ROWS = 5000;
const FIELDS: { key: ClientField; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "first", label: "First name" },
  { key: "last", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "notes", label: "Notes" },
];

function message(e: unknown): string {
  return e instanceof Error ? e.message : "That didn't work.";
}

/** HLD 4.8: the venue's own client list, and moving it over from Fresha or another app. */
export function ClientsPage() {
  const { business } = useBusiness();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Client[]>(`/businesses/${business.id}/clients`)
        .then(setClients)
        .catch((e: unknown) => setError(message(e))),
    [business.id],
  );

  useEffect(() => {
    load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = (clients ?? []).filter(
    (c) =>
      !needle ||
      c.name.toLowerCase().includes(needle) ||
      (c.email ?? "").toLowerCase().includes(needle) ||
      (digits !== "" && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-muted">Only your business sees these. They&apos;re stored encrypted.</p>
        </div>
        {!importing && (
          <Button onClick={() => setImporting(true)}>
            <Icon name="download" /> Import clients
          </Button>
        )}
      </div>
      <FormError message={error} />
      {notice && (
        <p
          role="status"
          className="pop rounded-[var(--radius-control)] bg-mint px-4 py-3 text-sm font-semibold text-spruce"
        >
          {notice}
        </p>
      )}

      {importing && (
        <Importer
          businessId={business.id}
          onClose={() => setImporting(false)}
          onDone={(text) => {
            setImporting(false);
            setNotice(text);
            load();
          }}
        />
      )}

      {clients === null && !error && <p className="text-muted">Loading…</p>}
      {clients !== null && clients.length === 0 && !importing && (
        <div className="rise flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8">
          <h2 className="text-xl font-bold">Bring your clients with you</h2>
          <p className="max-w-prose text-muted">
            Export your client list from Fresha as a CSV file, from its Clients page, then import it here. A CSV from
            any other booking app or spreadsheet works too.
          </p>
          <Button onClick={() => setImporting(true)}>Import clients</Button>
        </div>
      )}
      {clients !== null && clients.length > 0 && (
        <section aria-labelledby="list-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="list-title" className="text-xl font-bold">
              {clients.length} {clients.length === 1 ? "client" : "clients"}
            </h2>
            <Field
              label="Search clients"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-72"
            />
          </div>
          {shown.length === 0 ? (
            <p className="text-muted">No clients match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
              {shown.slice(0, 200).map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <span className="font-semibold">{c.name}</span>
                  <span className="flex flex-wrap gap-x-4 text-sm text-muted">
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span className="break-all">{c.email}</span>}
                  </span>
                  {c.notes && <p className="w-full text-sm text-muted">{c.notes}</p>}
                </li>
              ))}
            </ul>
          )}
          {shown.length > 200 && <p className="text-sm text-muted">Showing 200. Search to find the rest.</p>}
        </section>
      )}
    </>
  );
}

function Importer({
  businessId,
  onClose,
  onDone,
}: {
  businessId: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: string[][] } | null>(null);
  const [columns, setColumns] = useState<Record<ClientField, number> | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (file && columns ? file.rows.map((cells) => toClient(cells, columns)) : []),
    [file, columns],
  );

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setError(null);
    setPreview(null);
    if (!chosen) return;
    const [headers, ...data] = parseCsv(await chosen.text());
    if (!headers || data.length === 0) {
      setFile(null);
      setError("That file has no rows. Choose the CSV you exported.");
      return;
    }
    if (data.length > MAX_ROWS) {
      setFile(null);
      setError(`That file has ${data.length} rows. Import up to ${MAX_ROWS} at a time by splitting it.`);
      return;
    }
    setFile({ name: chosen.name, headers, rows: data });
    setColumns(guessColumns(headers));
  }

  const hasName = columns && (columns.name >= 0 || columns.first >= 0 || columns.last >= 0);

  useEffect(() => {
    if (!hasName || rows.length === 0) return;
    let live = true;
    api<ImportResult>(`/businesses/${businessId}/clients/import`, { method: "POST", body: { rows, dry_run: true } })
      .then((r) => live && setPreview(r))
      .catch((e: unknown) => live && setError(message(e)));
    return () => {
      live = false;
    };
  }, [businessId, rows, hasName]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<ImportResult>(`/businesses/${businessId}/clients/import`, {
        method: "POST",
        body: { rows, dry_run: false },
      });
      const parts = [`Imported ${r.added} ${r.added === 1 ? "client" : "clients"}.`];
      if (r.duplicates) parts.push(`${r.duplicates} ${r.duplicates === 1 ? "was" : "were"} already in your list.`);
      if (r.invalid.length) parts.push(`${r.invalid.length} skipped.`);
      onDone(parts.join(" "));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="import-title"
      className="rise flex flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="import-title" className="text-xl font-bold">
            Import clients
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Use Fresha&apos;s client export (CSV), or any CSV with a name column. Nothing is saved until you press
            Import.
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Cancel<span className="sr-only"> import</span>
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="client-file" className="text-sm font-semibold">
          CSV file
        </label>
        <input
          id="client-file"
          type="file"
          accept=".csv,text/csv"
          onChange={pick}
          className="min-h-12 rounded-[var(--radius-control)] border border-line-strong bg-ground px-3 py-2 text-sm file:mr-3 file:min-h-9 file:rounded-full file:border-0 file:bg-mint file:px-4 file:font-semibold file:text-spruce"
        />
      </div>
      <FormError message={error} />

      {file && columns && (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">
              Columns in {file.name} ({file.rows.length} {file.rows.length === 1 ? "row" : "rows"})
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {FIELDS.map(({ key, label }) => (
                <Select
                  key={key}
                  label={label}
                  value={columns[key]}
                  onChange={(e) => {
                    setPreview(null);
                    setColumns({ ...columns, [key]: Number(e.target.value) });
                  }}
                >
                  <option value={-1}>Not in this file</option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          </fieldset>

          {!hasName && (
            <p className="rounded-[var(--radius-control)] bg-warn-soft p-4 text-sm">
              Choose which column holds the name, or the first and last name.
            </p>
          )}

          {hasName && (
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold">First rows</h3>
              {/* Scrolls sideways on a phone, so it takes focus for keyboard users. */}
              <div
                tabIndex={0}
                role="region"
                aria-label="First rows of the file"
                className="overflow-x-auto rounded-[var(--radius-control)] border border-line"
              >
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="bg-ground">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Name
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Phone
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Email
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-2">{r.name || <span className="text-danger">Missing</span>}</td>
                        <td className="px-3 py-2">{r.phone}</td>
                        <td className="px-3 py-2 break-all">{r.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div aria-live="polite">
                {!preview && <p className="text-muted">Checking the file…</p>}
                {preview && (
                  <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-mint p-4 text-sm">
                    <p className="font-semibold">
                      {preview.added} new {preview.added === 1 ? "client" : "clients"} to import
                      {preview.duplicates > 0 && `, ${preview.duplicates} already in your list`}
                      {preview.invalid.length > 0 && `, ${preview.invalid.length} to skip`}.
                    </p>
                    {preview.invalid.length > 0 && (
                      <ul className="list-disc pl-5">
                        {preview.invalid.slice(0, 5).map((p) => (
                          <li key={p.row}>
                            Row {p.row + 1}: {p.reason}
                          </li>
                        ))}
                        {preview.invalid.length > 5 && <li>And {preview.invalid.length - 5} more.</li>}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <Button onClick={run} loading={busy} disabled={!preview || preview.added === 0} className="self-start">
                Import {preview ? preview.added : ""} {preview?.added === 1 ? "client" : "clients"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
