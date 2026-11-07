# Spruce

Book beauty and wellness appointments at venues near you. EU-hosted, GDPR-first, pay at the venue.

## Run it locally

You need Docker, Python 3.12+ with [uv](https://docs.astral.sh/uv/), and Node 22+.

```bash
# 1. Database and Redis
docker compose -f infra/docker-compose.yml up -d

# 2. API on http://127.0.0.1:8000 (docs at /docs)
cd api
cp .env.example .env   # then fill SPRUCE_DATA_KEY and SPRUCE_INDEX_KEY
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1

# 3. Web on http://localhost:3000
cd web
npm install
npm run dev
```

## Checks (the same ones CI runs)

```bash
cd api && uv run ruff check . && uv run mypy app tests && uv run pytest
cd web && npm run typecheck && npm run lint && npm run build && npm run e2e
```

## Layout

- `api/`: FastAPI modular monolith, SQLAlchemy 2, Alembic.
- `web/`: Next.js 16, Tailwind 4. Design tokens live in `web/src/app/globals.css`.
- `infra/`: local Postgres + PostGIS and Redis.
- `docs/slices/`: one spec per build slice.

See `CLAUDE.md` for the rules every change follows.
