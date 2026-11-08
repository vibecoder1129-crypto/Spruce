# Slice 4: Shifts and calendar

Specs: LLD 3.3 (WeeklyShift, TimeOff, Booking), 4.2 (walk-in), 4.4 (shifts, time off), 5.1;
HLD 4.4, 4.5, 4.6, 9; feature list 3 (Calendar, Calendar controls, Quick actions, Owner-created /
walk-in appointment, Appointment detail, Time-off / blocked time, Weekly shifts) and 4 (staff
Calendar, Weekly shifts).

Done when: an owner sets this week's shifts, opens the day board, blocks a lunch hour, and adds a
walk-in from an empty slot. Two people trying to book the same staff member at the same time get
exactly one booking. A staff member with `calendar.view` sees their own column; with
`calendar.team` they see everyone's; with `appointments.own` they can add and change bookings on
their own column only.

## Scope

**Database** (migration 0005)

- `weekly_shifts`: staff, `week_start` (a Monday), `day` (0 = Monday to 6), `starts` and `ends`
  (local wall-clock times at the staff member's location, 15-minute steps, `ends > starts`).
  One shift per staff member per day (unique). Dated per week, not a recurring rule (LLD 3.3).
  A lunch break is blocked time, not a split shift.
- `time_off`: staff, `starts_at`, `ends_at` (timestamptz), optional `reason` (60 chars, shown on
  the board). Calendar-level, independent of shifts. Blocked time from the board is the same row.
- `bookings`: business, location, staff, service, `consumer_user_id` (null for guests, used from
  slice 5), guest contact (name, phone and email, encrypted as one blob), `starts_at`, `ends_at`,
  `status` (`pending`, `confirmed`, `completed`, `cancelled`, `no_show`), `source` (`consumer`,
  `owner`), `notes`, `price_minor` and `currency` copied from the service when booked,
  `created_by_user_id`, `cancelled_at`.
  - **`EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE
    (status <> 'cancelled')`.** This is the authority on double bookings (LLD 5.1). The API never
    pre-checks overlap between bookings; it inserts and turns the violation into a 409.
  - `tstzrange`, not the LLD's `tsrange`, so bookings stay right across time zones and clock
    changes (plan decision, 7 Nov).

**API**

Times from the web are local wall-clock values (`2026-11-09T10:15`, no offset), read in the
location's time zone by the server. A time that doesn't exist because the clocks go forward is a
422. Responses carry UTC instants plus the location's time zone.

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /businesses/{id}/shifts?week=` | Owner | Every active staff member's shifts for that week |
| `PUT /businesses/{id}/shifts?week=` | Owner | Replaces the whole week. `shift.manage` is never grantable |
| `GET /me/shifts?week=` | That staff member | Own shifts, view only |
| `POST /staff/{id}/time-off` | Owner | Blocked time or time off |
| `DELETE /time-off/{id}` | Owner | |
| `GET /businesses/{id}/calendar?date=&location_id=` | Owner; staff with `calendar.view` | Day board: columns, shifts, bookings, blocked time, and what the caller may do |
| `POST /businesses/{id}/bookings/walk-in` | Owner; staff with `appointments.own` on themselves | Staff, service, start, guest name (phone and email optional), notes |
| `GET /bookings/{id}` | Whoever may see that column | Detail with guest contact and notes |
| `PATCH /bookings/{id}` | Owner; staff with `appointments.own`, own column only | Start, staff, service, notes |
| `PATCH /bookings/{id}/cancel` | Same | Cancelled bookings free the slot |

Rules the tests cover:

- **Ownership:** another business's staff, booking or time off is a 404. A staff member asking
  for another business's calendar gets a 404.
- **Role denials:** consumers and platform admins get 403. Staff get 403 on shifts and time off
  writes whatever flags they hold.
- **Flags:** staff without `calendar.view` get 403 on the calendar. With it they get only their
  own column, unless `calendar.team` is on too. A booking on another column is a 404 for them.
  Without `appointments.own`, walk-in, edit and cancel are 403. With it, booking for someone else
  is 403, a booking on a column they can't see is 404, one they can see but isn't theirs is 403,
  and they can't move a booking to someone else.
- **Booking rules:** the service must be active and assigned to that staff member (404
  otherwise). The time must sit inside that day's shift and outside any blocked time (409 with a
  plain reason). The end is start plus the service's duration, and the price comes from the
  service; neither can be sent by the client. Only `pending` and `confirmed` bookings can be
  changed or cancelled.
- **Conflicts:** an overlapping booking for the same staff member is a 409 "That time was just
  taken." Fifty concurrent walk-ins for one slot create exactly one booking. A cancelled booking
  doesn't block its slot.
- **Audit:** `shifts.set`, `time_off.create`, `time_off.delete`, `booking.create`,
  `booking.update`, `booking.cancel`, in the same transaction as each write. Guest names, phones,
  emails and notes are never logged.

**Web**

- `/dashboard/calendar`, the staff day board:
  - 08:00 to 20:00 in 15-minute rows, one column per staff member, hours outside the shift
    shaded, bookings and blocked time drawn to scale;
  - controls: date navigation (previous, today, next, pick a date), location when there's more
    than one, team filter, search by client or service, board or list view, and row size;
  - clicking an empty slot offers "Add appointment" and "Block time" prefilled with that staff
    member and time. "New appointment" and "Block time" buttons do the same from the keyboard;
  - the appointment panel shows the client, service, time, contact and notes, with edit, move and
    cancel.
- `/dashboard/team/shifts`: the week's roster as a staff-by-day grid of start and end times, with
  this week, next week and pick a week, "Copy last week" and Save. Linked from the team page.
- `/staff`: "My week" with the staff member's shifts. With `calendar.view`, a link to
  `/staff/calendar`, the same board scoped by the API.
- The dashboard checklist's "Opening hours" item becomes "Weekly shifts" and links to the roster.

## Decisions

- **Walk-ins must fit a shift.** The owner adds or stretches the shift first. This keeps one
  availability rule for the board now and the marketplace in slice 5.
- **Guests only for now.** Picking an existing customer arrives with the customer list in
  slice 6. Guest contact is encrypted at rest like other personal data.
- **Status changes** (complete, no-show, checkout) are slice 6. Here bookings are created as
  `confirmed` and can only be edited or cancelled.

## Acceptance

- Tests first for each endpoint, including 401, 403 and the 404 for another owner's data.
- The 50-way concurrency test against real Postgres.
- Migration up, down, up in CI.
- e2e: the owner sets shifts, blocks time, adds a walk-in from an empty slot, sees it on the
  board and in list view, then cancels it. A staff member with `calendar.view` sees only their
  own column.
- axe on the board (board and list view), the appointment panel, the roster and `/staff`, on
  desktop and phone.
