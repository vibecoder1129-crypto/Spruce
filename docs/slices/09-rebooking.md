# Slice 9: Rebooking reminders and "Book again"

Feature list: rebooking reminders and "book again". Done when: an owner sets, per service, how
many weeks until a client usually comes back. That long after a finished visit, the customer gets
one email with a link to book the same service with the same person, unless they've already booked
again. Customers can turn these emails off. Past bookings have a "Book again" button.

## Scope

**Database** (migration 0011): `services.rebook_weeks` (0 = off; 2, 3, 4, 6, 8, 12 or 26),
`users.rebook_reminders` (on by default), `bookings.rebook_reminded_at`.

**API and jobs**

| What | Who | Notes |
| --- | --- | --- |
| `PATCH /services/{id}` | Owner | Adds `rebook_weeks` |
| `PATCH /me` | Customer | `rebook_reminders` on or off |
| `python -m app.cli send-reminders` | Operator, daily | Sends what's due and prints how many |

A finished visit is due once `rebook_weeks` have passed since it ended, for 7 days after that (so
turning a service on never emails old clients about visits from last year). It is skipped when the
customer turned reminders off, already has an upcoming booking at that venue, or has another visit
there after this one, or when the venue isn't public. Each visit is reminded once.

Rules the tests cover: each skip above, one email per visit, the link, 401/403 on `PATCH /me`, 422
for other week counts, and no personal data in logs.

**Web**

- Services: "Remind clients to rebook after" on each service.
- Your bookings: "Book again" on past visits. Account: "Rebooking reminders" switch.
- Every reminder has a one-click stop link (`/emails/stop`, signed per user, works without logging
  in). The page asks for one button press, so mail scanners that open links don't unsubscribe.
- A "Book again" or email link naming someone who left, or no longer does the service, falls back to
  anyone available.

## Decisions

- Reminders are on by default (the EU "existing customer, similar service" soft opt-in), with an
  opt-out in every email and in Account. Customer signup says so in one line. Pending archit's confirmation.
- A daily command, not a worker: hosting (slice 23) schedules it. shortcut: until then it's run by hand or by Task Scheduler on Jarvis.
