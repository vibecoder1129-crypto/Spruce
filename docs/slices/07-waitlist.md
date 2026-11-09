# Slice 7: Waitlist

Third part of the switching pack (feature list: waitlist). Done when: a customer who finds no open
times for a service on a day can join that day's waitlist. When a booking for that service's team on
that day is cancelled or moved away, everyone waiting for that day is emailed that a time opened up,
with a link to book. First to book wins; the EXCLUDE constraint still decides. The venue sees who is
waiting on the day board.

## Scope

**Database** (migration 0009): `waitlist_entries`: business, service, customer, local `day`, the
name the customer gave (encrypted like a booking's guest), `notified_at`. Unique per
(customer, service, day).

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `POST /me/waitlist` | Customer | `service_id`, `date`, `name`. 409 if that day still has open times |
| `GET /me/waitlist` | Customer | Today and later |
| `DELETE /me/waitlist/{id}` | Customer | 404 for anyone else's |
| `GET /businesses/{id}/waitlist?date=` | Owner, staff with `calendar.view` | Names and services |

Rules the tests cover:

- 401 signed out, 403 for a business account joining, 404 for another business's list, another
  customer's entry, or an unlisted venue's service.
- The day must be today to 60 days ahead (422). At most 5 days waiting at once (409). Joining twice
  is a 409.
- Cancelling (customer or venue) or moving a booking to another time emails each waiting customer
  for that business and day whose service now has an open time, once, and sets `notified_at`.
- Booking that service on that day removes the customer's entry.
- Emails and the audit log carry no personal data beyond the recipient address.

**Web**

- Booking flow, Time step: "No open times" offers "Join the waitlist for this day" (sign in first).
- Your bookings: a "Waitlist" list with Leave.
- Day board: "Waiting for a time" list under the summary when anyone is waiting.

## Decisions

- One notice per entry. shortcut: no repeat emails, so a customer who misses the first one has to
  check again; add a re-notify once a day if venues ask.
- Freed time from removing a time-off block or extending a shift doesn't notify. Cancellations and
  moves are where waitlists earn their keep.
