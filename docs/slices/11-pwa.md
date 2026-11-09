# Slice 11: Installable app (PWA)

Feature list: installable app for customers and venue teams. Done when: Spruce can be added to a
phone's home screen or installed on a computer, opens in its own window with its own icon, has
opens where each person works, and says clearly when there is no connection instead of showing the
browser's error.

## Scope

No database or API change.

**Web**

- `app/manifest.ts` (served at `/manifest.webmanifest`): id, name, language, standalone display,
  the page colours, icons (192, 512 and a maskable 512) and a "Find a venue" shortcut (the only
  one that suits customers and venues alike).
- `/app`, where the installed app starts: signed-in people go to their own home (bookings,
  dashboard, their day, admin), everyone else to the home page.
- Icons: a white spruce on the brand green, drawn as plain shapes by `web/scripts/app-icons.py`
  (`app/icon.png`, `app/apple-icon.png`, and the manifest icons in `public/icons/`).
- `public/sw.js`: caches only the offline page. Page loads go to the network; if that fails, the
  offline page is shown. Nothing else is cached, so no one's bookings or customer data is ever
  stored on the device by Spruce, and a stale page is never shown.
- `/offline`: "You're offline", with a Try again button; it reloads by itself once back online.
- A "You're offline" bar whenever the connection drops mid-use, gone when it's back.
- The worker's cache is named per build (`/sw.js?build=...`), so a new build refreshes the saved
  offline page.
- The worker is registered in production builds only, so local development never serves old
  files.
- iOS: `appleWebApp` metadata so a home-screen Spruce opens full screen with the right title.

Tests (e2e): the manifest's fields and that every icon it lists loads with the right size; the
worker registers; going offline and loading a page shows the offline page, and coming back online
and pressing Try again loads it; the offline page passes axe.

## Decisions

- No custom "Install" button: browsers show their own, and a second prompt would nag.
- No manifest screenshots yet: they should show real venues, which come with launch (slice 20).
- No offline booking or calendar: a booking made offline can't be checked against the database's
  double-booking rule, and caching the calendar would keep customer data on shared devices.
- No push notifications here; email stays the channel until a later slice needs more.
