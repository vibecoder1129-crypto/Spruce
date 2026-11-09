# Slice 6b: No-shows, cancellation window and client flags

Second part of the switching pack. It covers no-show protection without payments: card on file and
deposits need Stripe and come once the Stripe account exists. Specs: LLD 3.5 (CustomerProfile),
4.3 (`PATCH /bookings/{id}/no-show`), 5.6; HLD 4.8; feature list 2 (Repeat customer flag, Risk
flag, Complete / cancel / no-show) and the customization suite's "operational rules (cancellation
policy, no-show handling)".

Done when: an owner sets how close to the start a customer can still cancel or move. Customers see
that policy before they book and on their bookings. After an appointment starts, the venue marks it
done or a no-show. A customer with two no-shows in a row at a venue is flagged there, and the owner
sees the flag on the calendar the next time that customer books. A customer with two finished
visits is marked as a regular.

## Scope

**Database** (migration 0008)

- `businesses.cancel_window_hours`: 0 (until the start), 2, 6, 12, 24 or 48. Defaults to 0, so
  nothing changes for existing venues.
- `customer_profiles`: (business, customer) unique, `no_show_streak`, `completed_count`. Only that
  business reads it. The flags are worked out from these two numbers, so they can't disagree with
  them.

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `PATCH /businesses/{id}` | Owner | Adds `cancel_window_hours` |
| `PATCH /bookings/{id}/complete` | Owner, staff with `checkout.own` on their own appointments | Confirmed and already started |
| `PATCH /bookings/{id}/no-show` | Same | Same |

Calendar bookings, booking details, the storefront and the customer's bookings gain what each needs:
`client_flags` (`risk`, `regular`) on venue views, `can_mark_staff_ids` on the day board (whose
visits the caller may mark), and `cancel_window_hours` on customer views.

Rules the tests cover:

- **Outcomes need a started, confirmed appointment.** Before the start, or once cancelled or already
  marked, it's a 409. The customer can't mark their own bookings (403). Staff need `checkout.own`
  and their own column, and anyone else's business is a 404.
- **The streak.** Each no-show adds one, and a finished visit resets it to zero. Two or more no-shows
  in a row means `risk`, and two finished visits means `regular`. Walk-ins have no customer account,
  so they have no flags.
- **Flags stay at that venue.** Another venue sees the same customer with no flags.
- **The window.** Inside it, a customer can't cancel or move (409, saying to contact the venue), and
  `can_change` is false. The venue can still cancel.
- **Every outcome is audited**, without personal data.

**Web**

- Dashboard Settings becomes real, starting with "Cancellation policy".
- Day board: the appointment panel gets "Mark as done" and "No-show" once it has started. A flagged
  customer shows "2+ no-shows here" on their appointments, and regulars show "Regular".
- The storefront, the Confirm step and Your bookings state the policy. Inside the window, a booking
  says to contact the venue instead of offering Change and Cancel.

## Decisions

- The spec shows the risk flag "before the owner confirms", but bookings into a computed open slot
  confirm at once (5b). So the flag appears on the appointment as soon as it lands on the calendar.
  If owners want to approve flagged customers first, that's a pending state, which arrives with deposits.
- "Mark as done" here only records the outcome. Checkout with a sale, tax and payment method builds on
  it in slice 6.

## Acceptance

- Tests first, including 401, 403 and 404, the 409s, the streak and its reset, and the window.
- e2e: an owner sets a 24-hour window, a customer sees it, and the owner marks a started appointment
  as a no-show. axe on every step, desktop and phone.
