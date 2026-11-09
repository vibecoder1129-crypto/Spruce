# Slice 6a: Clients and import from Fresha

First part of the switching pack: the things a venue needs before it leaves another booking app.
The rest of the pack (no-show protection, waitlist, owner-approved support access) follows as its
own PRs. Specs: HLD 4.8 and LLD 3.5 (business-local CRM); feature list 2 (Customer CRM).

Done when: an owner downloads their client list from Fresha (or any app that exports a
spreadsheet), uploads it on a new Clients page, checks how the columns were read and what will
happen, imports it, and finds their clients in a searchable list.

## Scope

**Database** (migration 0007)

- `clients`: business, `details_encrypted` (name, phone, email and notes as one encrypted JSON
  blob), `email_index` and `phone_index` (keyed HMACs, so duplicates are found without storing
  plain values), `source` (`imported` or `added`), `created_at`. Unique per business on each
  index. Deleting a business deletes its clients.

**API** (owner only)

| Method and path | Notes |
| --- | --- |
| `GET /businesses/{id}/clients` | The business's clients, sorted by name |
| `POST /businesses/{id}/clients/import` | `rows` (name, optional phone, email, notes) and `dry_run`. Returns how many are added, already in the list, and which rows are invalid and why |

Rules the tests cover:

- **Business-local.** Only that business's owner can see or import its clients. Signed out is
  401, other roles get 403 and another owner's business is a 404. Staff access waits for the CRM
  permission in reports.
- **The server checks every row.** A name is required, an email must look like one, and a phone
  needs 6 to 15 digits. Bad rows are reported by row number and skipped. Good rows still import.
- **No duplicates.** A row whose email (in any letter case) or phone (in any format) is already in
  the list, or earlier in the same file, is counted as already there and not added again.
- **A dry run changes nothing**, so the preview can't double-import.
- **Limits:** 5,000 rows per import and 20 imports an hour per business.
- **No personal data in logs or the audit trail.** The audit entry holds counts only.

**Web**

- `/dashboard/clients`: a search box and the client list. An empty list explains the import.
- Import: pick a CSV file, which is read in the browser. Spruce matches the columns from their
  headers (Fresha's export names, plus common ones like "Mobile" and "E-mail", and comma or
  semicolon separators) and the owner can change each match. The preview shows the first rows and
  the dry run's counts before anything is saved.
- "Clients" joins the dashboard menu.

## Decisions

- Imported clients have no Spruce account, so a client here is the venue's own record, not the
  spec's `CustomerProfile` keyed by `consumer_user_id`. Linking a client to an account that books
  later comes with the CRM flags (repeat customer, risk) in the no-show work.
- The CSV is parsed in the browser and sent as rows, so the server never handles an uploaded file.
  It still validates every value.

## Acceptance

- Tests first, including the denials (401, 403, 404), duplicates, invalid rows, the row limit and
  the audit entry.
- e2e: an owner imports a Fresha-style CSV with a duplicate and a bad row, sees the preview, imports,
  and finds a client by search. axe on every step, desktop and phone.
