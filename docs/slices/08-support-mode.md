# Slice 8: Admin support mode

Last part of the switching pack: "free setup help". Done when: an owner turns on support access
for 24 hours or 3 days. While it's on, a platform admin can open the owner's dashboard to set
things up for them, for an hour at most. Every change made in support mode is logged and the owner
can read that log. The owner can turn access off at any time, which ends support at once.

## Scope

**Database** (migration 0010): `businesses.support_until` (null means off) and
`sessions.support_admin_id` (the admin behind a support session).

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `PUT /businesses/{id}/support` | Owner (not in support mode) | `hours`: 0, 24 or 72. 0 ends live support sessions |
| `GET /businesses/{id}/support` | Owner | `until`, and the log of support changes |
| `POST /admin/businesses/{id}/support` | Platform admin | 409 unless allowed. Starts a support session as the owner |

Rules the tests cover:

- 401 signed out. 403 for customers, staff and owners on the admin route, and for admins on the
  owner routes. 404 for another owner's business.
- A support session lasts an hour, or until access ends, whichever is first. Turning access off,
  or its time running out, ends it on the next request (401).
- In support mode: account and security endpoints (`/auth/*` other than csrf, refresh and logout)
  and the support setting itself are 403. Everything else works as the owner.
- Every non-GET request in support mode is audited as `support.action`, with the admin as actor
  and the method and path. Starting and ending are audited too. No personal data in the log.
- `GET /me` says `support: true` in support mode.

**Web**

- Dashboard Settings: "Support access" with Off / 24 hours / 3 days, when it ends, and the log.
- Admin, business list: "Open as support" when the owner allows it.
- Dashboard: a banner in support mode, "You're helping {business} as Spruce support. Every change
  is logged." with "End support".

## Decisions

- Support replaces the admin's session in that browser; ending support signs out, and the admin
  signs in again. shortcut: no switch-back, add one if admins find it slow.
- One hour per support session; an admin can start another while access is on.
