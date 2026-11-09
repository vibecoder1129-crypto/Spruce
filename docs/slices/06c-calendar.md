# Slice 6c: A more useful day board

archit asked (9 Nov) for a calendar that's more useful, with the unnecessary parts removed. This
slice ships in two PRs: this one (A) cleans up the day board, and B adds the week view, drag to
move and live updates.

## A: cleanup and quick wins (web only, no API change)

- **Removed:** the Compact / Roomy rows toggle. Rows are one fixed size.
- **Kept on purpose:** the Date box (to jump weeks ahead) and the header "Block time" button. Clicking
  a slot needs a mouse, so keyboard and screen-reader users need the button.
- **Fits the day:** the board shows only the hours from the earliest shift or appointment to the
  latest, on whole hours, instead of a fixed 08:00–20:00.
- **Sticky:** staff names and times stay in view while scrolling. The board opens at the current time
  today, or at the first appointment on other days.
- **Status at a glance:** each appointment is coloured and labelled as booked online, added by the
  venue, waiting to confirm, done, or no-show. A colour key says the same in words. Client flags show
  on the block when there's room.
- **Day summary:** appointments, booked time, free time and expected takings for the people shown,
  plus no-shows when there are any.

## B: week view, drag to move, live updates

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /businesses/{id}/calendar/week?staff_id=&week=` | Owner, staff with `calendar.view` | One person's Monday-to-Sunday: shifts, appointments (with client flags) and blocked time |

Rules the tests cover: the week starts on a Monday (422 otherwise). Staff need `calendar.view` (403),
and without `calendar.team` they see only their own week (404 for a colleague, like the day board).
Another business's staff is a 404, signed out is 401, and customers get 403. Cancelled bookings
leave the week.

**Web**

- **Week view:** Day / Week / List. Week shows one person (from the Team filter) as seven day cards
  with shift hours, free time and appointments. A day or an appointment opens on the day board.
- **Drag to move:** drag an appointment to another time or person on the day board. It uses the
  existing `PATCH /bookings/{id}`, so the shift, blocked time, service and the EXCLUDE constraint are
  all re-checked. Dragging is a mouse shortcut. "Edit or move" in the panel does the same for
  keyboard, touch and screen-reader users (WCAG 2.5.7).
- **Live updates:** the board refetches every 30 seconds while the tab is visible, and when you come
  back to the tab. A new online booking is announced in the status line.

## Acceptance

- e2e: the summary and colour key show after booking a walk-in. Slot clicks follow the board's
  start hour. axe on every step, desktop and phone.

## Part D: redesign for bigger teams and several locations

- Every team member gets a colour from a fixed set of 12, in team order. Each colour passes 4.5:1 for white text and on its own tint.
  Blocks, column headers, week view and list all use it, so you can tell people apart at a glance.
- Status is shown with a mark as well as colour (● online, ○ added by the venue, … waiting, ✓ done, ✕ no-show), so it never relies on colour alone.
- Team chips show or hide people ("Everyone (N)" resets). The row scrolls sideways, so 15 or more people still fit. Columns narrow when more than 6 are shown.
- A business with more than one location gets location buttons in the header. Switching resets the team filter.
- A week strip under the date arrows jumps to any day of the week. The day summary is one compact bar with the colour key.
- No API change. e2e: calendar-team.spec.ts covers 15 people, hiding and restoring, whose week, and switching locations, with axe on each.
