"""Operator commands. `python -m app.cli create-admin` makes a platform admin.

Admin delegation from inside the app arrives in slice 8; until then this is the only way.
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.crypto import email_index, encrypt, hash_password, normalize_email
from app.db import get_sessionmaker
from app.identity.models import Role, User
from app.identity.schemas import TERMS_VERSION
from app.models_base import utcnow

EMAIL_CONTEXT = "users.email"


async def create_admin(db: AsyncSession, email: str, password: str) -> User:
    index = email_index(email)
    if await db.scalar(select(User.id).where(User.email_index == index)):
        raise SystemExit("An account with this email already exists.")
    user = User(
        email_index=index,
        email_encrypted=encrypt(normalize_email(email), EMAIL_CONTEXT),
        password_hash=hash_password(password),
        role=Role.admin,
        terms_version=TERMS_VERSION,
        terms_accepted_at=utcnow(),
        # An operator created it with a known address; two-step setup is still required.
        email_verified_at=utcnow(),
    )
    db.add(user)
    await db.flush()
    audit(db, actor=None, action="admin.create", target_type="user", target_id=user.id, via="cli")
    await db.commit()
    return user


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-admin", help="Create a platform admin")
    create.add_argument("--email", required=True)
    args = parser.parse_args()
    password = getpass.getpass("Password (12+ characters): ")
    if len(password) < 12:
        raise SystemExit("The password needs at least 12 characters.")

    async def run() -> None:
        async with get_sessionmaker()() as db:
            await create_admin(db, args.email, password)
        print("Admin created. They set up two-step verification at first login.")

    # psycopg's async mode can't use Windows' default Proactor loop.
    asyncio.run(run(), loop_factory=asyncio.SelectorEventLoop if sys.platform == "win32" else None)


if __name__ == "__main__":
    main()
