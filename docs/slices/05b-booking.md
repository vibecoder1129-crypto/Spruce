# Slice 5b: Customer booking

Second half of slice 5 (5a was discovery). Specs: LLD 3.3, 4.2 (`GET /businesses/{id}/availability`,
`POST /bookings`, cancel, reschedule), 5.1; HLD 4.1, 4.4; feature list 2 (Book flow, Booking receipt,
Home hub, My Bookings) and 7.3, 7.4.

Done when: a signed-in customer picks a service, a professional (or anyone) and a real open time,
confirms, and the booking appears on the owner's day board. The customer sees it in their bookings
and can cancel or move it. Every step sends an email.

## Scope

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /marketplace/businesses/{id}/availability` | Public | `service_id`, `date`, optional `staff_id`. Open start times, in 15-minute steps, for each professional who does the service |
| `POST /bookings` | Customer | `service_id`, `staff_id`, `start` (venue wall-clock), `name`, optional `phone` and `notes` |
| `GET /me/bookings` | Customer | Upcoming (soonest first) and past (latest first), with venue, service, professional, address, price and whether it can still change |
| `PATCH /bookings/{id}/cancel` | Customer (own), owner, staff with `appointments.own` | The customer path is new |
| `PATCH /bookings/{id}/reschedule` | Customer (own) | New `start`, optional new `staff_id`; same service |

No migration: `bookings` already has `consumer_user_id` and `source`.

Rules the tests cover:

- **Slots are computed, never trusted.** An open time is inside that day's shift, outside time off, clear of
  every booking that isn't cancelled, in the future, and long enough for the service. Booking re-checks
  all of this, and the EXCLUDE constraint is still the final word on overlaps (409 when it's taken).
- **Only public venues.** A business that isn't listed (5a's rule) has no availability and can't be booked
  (404). A professional who doesn't do the service, or isn't active, is a 404 as in slice 4.
- **The server decides** the end time, price, currency, location and status. Booking is up to 60 days
  ahead.
- **Customers only.** Signed out is 401; owners, staff and admins get 403. A customer sees and changes only
  their own bookings; anyone else's is a 404.
- **Abuse limits (HLD 4.4):** at most 2 upcoming bookings at one business and 6 in total, and 10 booking
  attempts an hour per customer.
- **Can change** means confirmed and not yet started. The venue's own cancellation policy arrives with
  no-show protection in the switching pack.
- **The name the venue sees** is stored with the phone in the same encrypted guest field as walk-ins, so
  the day board shows it and the business keeps its own client details. It is never logged or audited.
- **Emails** go to the customer when a booking is confirmed, moved or cancelled, whoever did it.

**Web**

- `/b/[id]/book`: Service → Professional ("Anyone available" or a person) → Time (the next 14 days,
  open times grouped by morning, afternoon and evening) → Confirm. The choices live in the URL, so
  signing in or signing up at Confirm brings the customer back to the same step.
- Login and signup accept a safe `next` path (same-site paths only).
- `/bookings`, the customer's home after login: upcoming and past bookings with cancel and "Change time".
- The storefront's services get a "Book" button.
- Owner dashboard: a "Your booking link" card with copy buttons for the link and an HTML button snippet for
  the venue's own site, Instagram bio or Google profile.

## Decisions

- Times show in the venue's time zone, named on the page. The customer's own time zone preference
  comes with notifications in slice 7.
- No pending state: a booking into a computed open slot is confirmed at once.
- The 2-no-show risk flag needs no-shows, which come with checkout in slice 6.

## Acceptance

- Tests first, including the denials (401, 403, 404) and the abuse limits.
- e2e: a customer books through the flow (signing in at Confirm), sees it in their bookings, moves it,
  and cancels it; the owner sees it on the day board. axe on every step, desktop and phone.
