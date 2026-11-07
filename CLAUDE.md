# Spruce: rules for anyone (human or AI) changing this repo

Spruce is an EU beauty and wellness booking marketplace. Customers pay at the venue.
The product specs (HLD, LLD, feature list) are confidential and live outside the repo;
slice specs in `docs/slices/` reference their section numbers.

## How work is done

- One vertical slice per PR (database, API, web, tests). Write the slice spec first.
- Tests first for every rule, including the denials: 401, 403, and 404 for another business's data.
- Smallest diff that does the job. No speculative abstractions, no unused options, no drive-by
  refactors. If a change isn't needed by the slice, it isn't in the PR.
- Postgres is the only test database. No SQLite.

## Never

- Commit secrets, `.env` files, or the confidential specs.
- Log personal data (emails, phones, names, addresses, tokens).
- Trust client-sent identity, prices, coordinates or permissions. The server decides.
- Hide a permission check in the UI only. Every check is enforced by the API.
- Show fake venues, ratings, reviews or testimonials on public pages.
- Scrape Google reviews. Imported reviews come from the official API and are labelled "From Google".
- Weaken a test, or skip one, to make CI pass.

## Product rules that shape code

- Employee permissions are deny-by-default and set by the owner only. Never grantable:
  permissions.manage, business.settings, chat.business, shift.manage.
- Revoking a permission revokes that employee's sessions in the same transaction, with an audit entry.
- Double bookings are prevented by the database (EXCLUDE on staff + time range), not app checks.
- Customer data is business-local: no business sees another business's customers.
- Accessibility target is WCAG 2.2 AA (European Accessibility Act). Touch targets are 44px or more.

## Local setup

See README.md.
