/** Reads a CSV export (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.split(/\r?\n/, 1)[0];
  // European spreadsheets often save with semicolons.
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.filter((r) => r.some((v) => v.trim()));
}

export type ClientField = "first" | "last" | "name" | "phone" | "email" | "notes";

// Header names from Fresha's client export and other common booking apps, lower-cased.
const ALIASES: Record<ClientField, string[]> = {
  first: ["first name", "firstname", "given name", "vārds"],
  last: ["last name", "lastname", "surname", "family name", "uzvārds"],
  name: ["full name", "name", "client name", "client", "customer name", "customer"],
  phone: ["mobile number", "mobile", "mobile phone", "phone", "phone number", "telephone", "tel", "tālrunis"],
  email: ["email", "e-mail", "email address", "e-pasts"],
  notes: ["note", "notes", "client notes", "comments"],
};

/** Which column holds each field, guessed from the headers. -1 when none matches. */
export function guessColumns(headers: string[]): Record<ClientField, number> {
  const clean = headers.map((h) => h.trim().toLowerCase());
  const out = {} as Record<ClientField, number>;
  for (const [field, names] of Object.entries(ALIASES) as [ClientField, string[]][]) {
    out[field] = clean.findIndex((h) => names.includes(h));
  }
  return out;
}

export type ClientRow = { name: string; phone?: string; email?: string; notes?: string };

/** One row of the file as the API expects it. A full-name column wins over first and last. */
export function toClient(cells: string[], columns: Record<ClientField, number>): ClientRow {
  const at = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
  const name = at(columns.name) || [at(columns.first), at(columns.last)].filter(Boolean).join(" ");
  const row: ClientRow = { name };
  if (at(columns.phone)) row.phone = at(columns.phone).slice(0, 40);
  if (at(columns.email)) row.email = at(columns.email).slice(0, 254);
  if (at(columns.notes)) row.notes = at(columns.notes).slice(0, 1000);
  row.name = row.name.slice(0, 200);
  return row;
}
