import asyncio
import sys

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

import app.audit
import app.booking.models
import app.business.models
import app.identity.models
import app.team.models  # noqa: F401
from app.config import get_settings
from app.db import Base

target_metadata = Base.metadata


def run_offline() -> None:
    context.configure(url=str(get_settings().database_url), target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    engine = create_async_engine(str(get_settings().database_url))
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    # psycopg's async mode can't use Windows' default Proactor loop.
    asyncio.run(
        run_online(), loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else None
    )
