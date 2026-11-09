# Slice order

One PR per slice, each stacked on the one before until it merges. Every slice follows CLAUDE.md:
spec first, tests first (with the 401, 403 and 404 denials), and the smallest complete change.

| # | Slice | State |
| --- | --- | --- |
| 0–5b | Foundation, accounts, onboarding, team, calendar, marketplace, booking | Built |
| 6a–6d | Fresha import, no-shows, calendar A/B, calendar redesign | Built |
| 7 | Waitlist | Built |
| 8 | Admin support mode (owner-approved, audited) | Built |
| 9 | Rebooking reminders and "Book again" | Built |
| 10 | Book now widget (venue site, Instagram, Google) | Built |
| 11 | Installable app (PWA) | Built |
| 12 | Rooms and equipment | |
| 13 | Consultation forms and patch tests | |
| 14 | Checkout, commissions and tips | |
| 15 | Product stock | |
| 16 | Gift cards, packages and memberships | |
| 17 | Email and SMS marketing | |
| 18 | Reviews from real visits, Google reviews via the official API | |
| 19 | Translations: LV, RU, then EE, LT | |
| 20 | Indexable venue and city pages | |
| 21 | Stripe: card on file and deposits (needs test keys) | Blocked |
| 22 | Subscription billing | |
| 23 | Hosting, status page, backups, data export | |
