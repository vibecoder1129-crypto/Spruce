# Slice 14: Checkout, commissions and tips

Feature list: checkout, staff commissions and tips. Customers still pay at the venue; Spruce
records what was paid, it doesn't take the money. Done when: at the end of a visit the person
doing it (or the owner) checks out with the amount paid, any tip and how it was paid; the owner
sets each team member's commission; and Reports shows takings, tips and commission per team
member for a date range, while a team member with "See their own numbers" sees only their own.

## Scope

**Database** (migration 0015): `staff_profiles.commission_percent` (0 to 100, default 0) and
`sales`: one per booking, with the team member, the amount for the service, the tip, how it was
paid (`card`, `cash`, `other`), the currency, and the commission worked out at checkout.

**API**

| What | Who | Notes |
| --- | --- | --- |
| `POST /bookings/{id}/checkout` | Owner, or the visit's team member with "checkout.own" | Amount, tip and method. Marks the visit done, like "Mark as done" |
| `PATCH /staff/{id}` | Owner | Now also `commission_percent`, 0 to 100 |
| `GET /businesses/{id}/takings?from=&to=` | Owner | Per team member: visits, amount, tips, commission, and totals, plus what was paid by card, cash and other |
| `GET /me/takings?from=&to=` | Team member with "reports.own" | Their own row only |

The appointment details show the sale once checked out. Dates are the venue's local days, both
ends included, at most 92 days apart. The commission is a percentage of the service amount, not
the tip (tips go to the person in full), rounded to the cent, and kept as it was at checkout so
a later change to the rate doesn't rewrite past pay.

Rules the tests cover: checkout records the sale and finishes the visit (once; a cancelled,
no-show or not yet started visit is a 409); amounts are whole cents from 0 to 100 000.00
(422 otherwise); commission uses the rate at checkout; takings add up per person, only within the
dates and only for this business; the date range is checked (422); 401 for visitors, 403 for
customers and for team members without the permission, 404 for another owner's business, and a
team member can't check out someone else's visit (403).

**Web**

- Calendar: "Check out" on a started visit replaces "Mark as done": the amount (the booked price
  to start with), a tip, and Card, Cash or Other. Afterwards the details show what was paid.
- Team: a "Commission" field for each team member.
- Reports: "Takings" for a date range (this month to start with), a row per team member and a
  total. Team members with "See their own numbers" see their own on their home page.

## Decisions

- No card payments here: those come with Stripe (slice 21). This records money taken at the
  venue, which is how every Spruce venue works today.
- "Mark as done" stays in the API for visits nobody needs to record a sale for, but the calendar
  offers checkout, so takings stay complete.
- One rate per team member. Per-service rates can come if venues ask.
