# Slice 0: Foundation and design system

Spec refs: HLD 3 (technology), HLD 8 (non-functional requirements).

## Scope

- Monorepo layout: `api/` (FastAPI), `web/` (Next.js 16), `infra/` (local Postgres + PostGIS, Redis), `docs/`.
- API: settings from `SPRUCE_*` env vars, async SQLAlchemy 2 on psycopg 3, Alembic with a baseline
  migration (btree_gist for the booking EXCLUDE constraint), `/health` that touches the database,
  strict security headers on every response, CORS limited to known origins, generic 500 responses.
- Logging: JSON lines; fields named like personal data are masked and email addresses inside
  messages are replaced, so personal data cannot reach logs by accident.
- Web: design tokens from the approved canvas, Plus Jakarta Sans self-hosted by `next/font`
  (no request to Google from the visitor's browser), Button, Field, Card, Badge, Wordmark,
  holding home page, `/design` gallery (noindex), skip link, focus ring, reduced motion.
- Web security headers: CSP, HSTS, nosniff, frame denial, referrer policy, no `X-Powered-By`.
- CI on every PR: ruff, mypy strict, migration up/down/up, pytest on Postgres + PostGIS,
  pip-audit, TypeScript, ESLint, npm audit, Next build, Playwright on desktop and phone,
  axe (WCAG 2.2 AA), Lighthouse (performance 95+, accessibility 100), gitleaks.

## Out of scope, and why

- **Cookie banner:** Spruce sets no non-essential cookies or trackers yet, so ePrivacy requires
  no banner. The consent component ships with the first non-essential cookie, not before.
- **Nonce-based CSP:** marketing pages use a static CSP so they stay statically rendered.
  Signed-in pages get a per-request nonce CSP in slice 1, when they exist.
- **PostGIS extension:** enabled in slice 2, with the first location table.

## Acceptance checks

- [x] `/health` returns 200 only when the database answers.
- [x] Security headers are present on success and on 404 responses.
- [x] CORS answers no unknown origin.
- [x] Personal data fields and emails are masked in logs.
- [x] `/` and `/design` have zero axe violations on desktop and phone.
- [x] No horizontal scroll at phone width.
- [x] Pages make no third-party requests.
- [x] Lighthouse: performance 99, accessibility 100, best practices 100 (local run).
