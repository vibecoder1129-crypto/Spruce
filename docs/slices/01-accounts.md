# Slice 1: Accounts and security

Spec refs: LLD 3.1 (identity), 4.1 (auth API), 5.3 (sessions checked per request); HLD 8.1, 8.2.

## Scope

**API**
- Shared signup for customers and owners. Staff and platform admins are never self-registered.
- Terms consent stored with its version and time (GDPR art. 7).
- Email stored AES-256-GCM encrypted; lookups use a keyed HMAC blind index.
- argon2id passwords (12–128 characters), rehashed on login when parameters change.
- Sessions table: opaque 10-minute access token and rotating refresh token, both stored hashed,
  in httpOnly SameSite=Lax cookies (`__Host-` prefixed when served over HTTPS).
  Every request checks the session row, so revoking it works on the very next request.
- Reusing an old refresh token revokes the session (stolen-token detection) and is audited.
- TOTP two-step verification, mandatory for owners and platform admins before any real work
  (`mfa_required`), with replay protection and 10 single-use recovery codes. Secret encrypted.
- Email verification (48 h link) and password reset (1 h link, revokes all sessions).
  Reset requests always answer 202, so they never reveal whether an account exists.
- Login errors are identical for unknown email and wrong password. 10 failures lock the
  account for 15 minutes.
- Rate limits in Redis on signup, login (per IP and per email), MFA, reset and resend.
- Double-submit CSRF token on every state-changing request.
- Append-only audit log, enforced by a database trigger, for signup, login, logout,
  lockout, MFA, password reset and refresh-token reuse.
- Email: console in dev, memory in tests, Brevo transactional API in production.

**Web**
- Log in, two-step verification (code or recovery code), sign up (customer or business),
  two-step setup with QR code and recovery codes, account page, forgot/reset password,
  email confirmation, draft Terms and Privacy pages.
- Same-origin API through a Next rewrite (`/api/*`), so cookies stay first-party.
- One refresh at a time in the browser, because parallel refreshes would look like token theft.
- Forms use `method="post"`, so a submit before JavaScript loads never puts a password in a URL.

## Decisions and known gaps

- **Signup says when an email is taken (409).** Booking needs a fast signup at Confirm, and
  hiding this would force a check-your-email detour. Login and reset do not leak existence.
- **CSP keeps `'unsafe-inline'` for scripts.** A nonce CSP blocked hydration: Next's partial
  prerendering ships inline scripts in a static shell that no per-request nonce reaches.
  Session cookies are httpOnly, CSRF is required, and connect-src, form-action and img-src
  keep data on this origin. Revisit when Next can hash its inline scripts.
- **Client IP** comes from uvicorn's `--proxy-headers`, which must trust only the reverse proxy
  in production (`--forwarded-allow-ips`). This is set when hosting is chosen (slice 9).
- **The audit log blocks UPDATE and DELETE.** TRUNCATE is blocked by the app's database role
  not owning the tables in production.
- Not in this slice: change password and email from settings, GDPR export and erasure (slice 8),
  staff invites (slice 3).

## Acceptance checks

- [x] 33 API tests on Postgres, including the denials: no CSRF, wrong code, replayed code,
      reused refresh token, reused reset and verify links, lockout, rate limit.
- [x] Email and MFA secret never appear in plain text in the database.
- [x] Audit log rejects UPDATE and DELETE.
- [x] Browser tests: customer signup to account to logout; owner signup through QR setup,
      recovery codes and a second-device login with a fresh code; wrong password error.
- [x] Zero axe violations on signup, account, two-step setup and verify pages.
- [x] Lighthouse on /login: performance 100, accessibility 100.
