# Slice 3: Services, team and permissions

Specs: LLD 3.1 (StaffProfile, PermissionGrant, Session), 3.2 (Service, StaffService), 4.4, 5.3;
HLD 4.6, 9; feature list 3 (Services, Team), 4 (Staff features).

Done when: an owner adds services, assigns them to staff, invites a staff member by email, and
turns individual permissions on and off; the staff member accepts the invite, signs in, and sees
only their own profile and the permissions they hold. Turning a permission off signs that staff
member out on their very next request.

## Scope

**Database** (migration 0004)

- `services`: business, name, category (the business categories), `duration_minutes`
  (5 to 480, a multiple of 5), `price_minor` (integer cents, 0 or more), `currency`, `active`.
  Services are archived, never deleted, because bookings in slice 5 will point at them.
- `staff_services`: (staff, service) composite key. Only assigned staff are bookable for a
  service (slice 5 reads this).
- `permission_grants`: staff, `flag_key`, `granted_at`, `granted_by_user_id`, `revoked_at`.
  One active row per (staff, flag), enforced by a partial unique index. A re-grant after a revoke
  is a new row, so the history stays.
  - `flag_key` is a Postgres enum of the six grantable flags only: `calendar.view`,
    `calendar.team`, `appointments.own`, `checkout.own`, `reports.own`, `chat.personal`.
  - The four never-grantable flags (`permissions.manage`, `business.settings`, `chat.business`,
    `shift.manage`) cannot be stored at all. They stay hardcoded owner/admin-only in code.
- `staff_invites`: staff, email (encrypted, with the blind index), `token_hash`, `expires_at`
  (7 days), `used_at`, `invited_by_user_id`. A new invite for the same staff member voids the
  old one.
- `staff_profiles`: add `active` (removing a staff member archives them); add the FK from
  `sessions.staff_id` that slice 1 left for this slice.

**API**

| Method and path | Who | Notes |
| --- | --- | --- |
| `GET /businesses/{id}/services` | That owner | Active and archived, active first |
| `POST /businesses/{id}/services` | That owner | Currency set by the server, never the client |
| `PATCH /services/{id}` | That owner | Name, category, duration, price, active |
| `PATCH /staff/{id}` | That owner | Display name, title, location (must be the business's), active |
| `PUT /staff/{id}/services` | That owner | Full list of service ids; each must belong to the business |
| `GET /staff/{id}/permissions` | That owner | All six flags with on/off |
| `PUT /staff/{id}/permissions/{flag}` | Owner only | `{"granted": bool}`; idempotent |
| `POST /staff/{id}/invite` | That owner | Emails a one-time link; 409 if the staff member already has a login |
| `GET /invites/{token}` | Public | Business name and staff display name, or 404 if used, expired or voided |
| `POST /invites/{token}/accept` | Public | Sets a password, creates a `staff` user, links the profile, signs in |
| `GET /me/staff` | That staff member | Own profile, business name, assigned services, own flags |
| `PATCH /me/staff` | That staff member | Own display name and title only |

Rules the tests cover:

- **Ownership:** another owner's service, staff or invite is a 404.
- **Role denials:** consumers get 403 on all of these. Staff get 403 on every owner endpoint,
  even with every flag on, because no flag grants `permissions.manage` or `business.settings`.
  Platform admins get 403 on the permission PUT (HLD 9: "only the owner").
- **Flags:** a never-grantable or unknown flag in the path is 404, never stored. A staff member
  with no grant row has no right; there's no default and no inheritance from title.
- **Revocation (LLD 5.3):** in one transaction: set `revoked_at` on the grant, revoke every
  active session for that `staff_id`, and write the `permission.revoke` audit entry. The next
  request with the old access token is 401. Session state is already checked on every request,
  so a test proves it by calling `/me/staff` with the old cookie right after the revoke.
- **Invites:** the token is stored hashed and single-use; accepting twice is 404. The invite
  email must not already belong to a user (409, the same wording signup uses). Invite and
  accept are rate-limited like signup, and staff sessions carry `staff_id`.
- **Audit:** `service.create`, `service.update`, `staff.update`, `staff.services`,
  `staff.invite`, `staff.accept`, `permission.grant`, `permission.revoke`, each in the same
  transaction as its write. Emails and names are never logged.

**Web**

- `/dashboard/services`:
  - a list grouped by category, with duration and price;
  - add and edit in a side panel, with an archive toggle;
  - an empty state that links to adding the first service.
- `/dashboard/team`:
  - staff cards with each person's location, services, login status and an invite button;
  - a staff panel with three tabs: Details, Services (checkboxes) and Permissions;
  - on the Permissions tab, each flag is a labelled switch with its plain-language meaning
    from HLD 9;
  - the four never-grantable rights are listed as "Only you", so the owner sees why they are
    missing;
  - turning a flag off asks for confirmation, because it signs that person out.
- `/invite/[token]`: "Join {business} on Spruce" with the password form, then `/staff`.
- `/staff`: the staff member's own page, showing their profile (editable name and title),
  assigned services, and the permissions they hold. The calendar arrives in slice 4.
- After login, staff go to `/staff`.

## Decisions

- **Currency is set by the server from the business's first location** (EUR for euro countries;
  PLN, CZK, SEK, DKK, HUF, RON, BGN, ISK, NOK and CHF elsewhere). Prices are integer minor
  units, never floats.
- **Two-step for staff is optional** in this slice. MFA is mandatory for owners and platform
  admins, and staff can't change business data. Revisit when `checkout.own` handles money in
  slice 6.
- **One business per staff login** (LLD 3.1: "v1 assumes one").
- Shifts, time off and the calendar are slice 4. Staff sign-in shows the profile page until then.

## Acceptance

- Tests first for each endpoint, including 401, 403 and the 404 for another owner's data, a
  never-grantable flag, and the revoke-signs-out test above.
- Migration up, down, up in CI.
- e2e:
  - The owner adds two services, assigns one, invites a staff member, and grants
    `calendar.view`. The staff member accepts the invite and sees the service and the flag on
    `/staff`.
  - The owner revokes the flag, and the staff member's next page load goes to `/login`.
- axe on the services page, the team panel (all three tabs), the invite page and `/staff`, on
  desktop and phone.
