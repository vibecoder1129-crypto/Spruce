import base64
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

# Settings are read once, so the test environment must be in place before the app imports.
os.environ.update(
    SPRUCE_ENV="test",
    SPRUCE_EMAIL_BACKEND="memory",
    SPRUCE_COOKIE_SECURE="false",
    SPRUCE_GEOCODER="fake",
    SPRUCE_DATA_KEY=base64.b64encode(b"d" * 32).decode(),
    SPRUCE_INDEX_KEY=base64.b64encode(b"i" * 32).decode(),
)

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app import email as mail
from app.db import get_engine
from app.main import create_app
from app.redis import get_redis

TABLES = (
    "audit_log, mfa_recovery_codes, one_time_tokens, sessions, staff_profiles, locations, "
    "businesses, users"
)


@pytest.fixture(autouse=True)
async def clean_state() -> AsyncIterator[None]:
    yield
    async with get_engine().begin() as conn:
        await conn.execute(text(f"TRUNCATE {TABLES} CASCADE"))
    redis = get_redis()
    keys = [k async for k in redis.scan_iter("rl:*")]
    if keys:
        await redis.delete(*keys)
    mail.outbox.clear()


@asynccontextmanager
async def new_client() -> AsyncIterator[AsyncClient]:
    """A browser-like client: keeps cookies and sends the CSRF header on every request."""
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        c.headers["x-csrf-token"] = (await c.get("/auth/csrf")).json()["csrf_token"]
        yield c


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with new_client() as c:
        yield c
