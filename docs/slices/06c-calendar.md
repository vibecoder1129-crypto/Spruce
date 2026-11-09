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

## Acceptance

- e2e: the summary and colour key show after booking a walk-in. Slot clicks follow the board's
  start hour. axe on every step, desktop and phone.
