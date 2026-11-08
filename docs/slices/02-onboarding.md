# Slice 2: Business onboarding

Specs: LLD 3.1 (StaffProfile), 3.2, 4.8, 6 (Location index); HLD 4.2, 4.3, 6; feature list 3, 5, 7.2.

Done when: a new owner goes from signup to a business with one location and one staff member,
submitted for review, and a platform admin can approve it or reject it with a reason.

## Scope

**Database**

- `businesses`: owner (one business per owner in v1, unique), name, category, approval status
  (`pending`, `approved`, `rejected`, `suspended`), rejection reason and note, `submitted_at`.
- `locations`: name, street, postal code, city, country, formatted address, latitude, longitude,
  time zone. A generated PostGIS `geography(Point)` column with a GiST index backs radius search
  in slice 5. Coordinates come from the server-side geocoder only.
- `staff_profiles`: business, location, display name, title, and a nullable `user_id`. Staff
  logins and invitations arrive in slice 3, so a staff member can exist before they have an
  account.
- PostGIS extension (migration 0003).

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /geo/countries` | Public | Launch countries with their time zones |
| `POST /businesses` | Owner, MFA done | 409 if the owner already has one |
| `GET /businesses/mine` | Owner | 404 before onboarding |
| `PATCH /businesses/{id}` | That owner | Name, category |
| `POST /businesses/{id}/locations` | That owner | Geocoded on the server; 422 if not found |
| `GET /businesses/{id}/locations` | That owner | |
| `POST /businesses/{id}/staff` | That owner | Location must belong to the business |
| `GET /businesses/{id}/staff` | That owner | |
| `POST /businesses/{id}/submit` | That owner | Needs a location and a staff member; resubmits after a rejection |
| `GET /admin/businesses?status=` | Platform admin, MFA done | Submitted businesses only |
| `PATCH /admin/businesses/{id}/approve` | Platform admin | Pending and submitted only, else 409 |
| `PATCH /admin/businesses/{id}/reject` | Platform admin | Reason from the HLD 6 list; a note is required for "Other" |

Another owner's business is a 404, never a 403, so ids can't be probed. Consumers and staff get
403 on owner endpoints; everyone but platform admins gets 403 on admin endpoints. Every write is
audited in the same transaction (`business.create`, `location.create`, `staff.create`,
`business.submit`, `business.approve`, `business.reject`).

**Geocoding**: `SPRUCE_GEOCODER=nominatim` calls OpenStreetMap Nominatim (1 request a second,
identified by User-Agent), `fake` returns fixed coordinates for tests, CI and local e2e, which
have no outbound network. Addresses are never logged.

**Web**

- `/onboarding`: three steps (Business, Location, Staff), then "Submit for review". It resumes at
  the first unfinished step.
- `/dashboard`: shell with Home, Calendar, Team, Services, Reports, Reviews, Settings. Home shows
  the review status (in review, rejected with the reason and a resubmit button, approved). Pages
  from later slices say when they arrive.
- `/admin/businesses`: review queue with approve, and reject with the reason list.
- After login, owners go to the dashboard (or onboarding), admins to the queue.
- `python -m app.cli create-admin` creates a platform admin (admin delegation is slice 8).

## Decisions

- One business per owner for v1, as LLD 3.1 assumes for staff. "+ Location" adds venues.
- Launch countries: EU 27, plus Iceland, Liechtenstein, Norway and Switzerland. A country with
  several time zones (Spain, Portugal) lets the owner pick; the server checks the pair.
- Suspend and reactivate are slice 8, with the rest of moderation.

## Acceptance

- Tests first for each endpoint, including 401, 403, the 404 for another owner's business, and
  that client-sent coordinates are rejected.
- Migration up, down, up in CI; GiST index exists on the geography column.
- e2e: owner signs up, sets up two-step, completes onboarding, sees "In review"; a platform admin
  approves it and the owner sees "Approved".
- axe and Lighthouse on the onboarding and dashboard pages.
