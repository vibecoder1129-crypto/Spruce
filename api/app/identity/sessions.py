"""Session lifecycle: issue, rotate, revoke, and the per-request check (LLD 3.1, 5.3)."""

import uuid
from datetime import datetime, timedelta

from fastapi import Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.config import get_settings
from app.cookies import ACCESS_COOKIE, REFRESH_COOKIE, clear_cookie, set_cookie
from app.crypto import hash_token, new_token
from app.identity.models import MFA_REQUIRED_ROLES, Session, User
from app.models_base import utcnow


def _issue_tokens(session: Session, response: Response, now: datetime) -> None:
    settings = get_settings()
    access, refresh = new_token(), new_token()
    session.access_token_hash = hash_token(access)
    session.access_expires_at = now + timedelta(seconds=settings.access_ttl_seconds)
    session.refresh_token_hash = hash_token(refresh)
    remaining = int((session.expires_at - now).total_seconds())
    set_cookie(response, ACCESS_COOKIE, access, settings.access_ttl_seconds)
    set_cookie(response, REFRESH_COOKIE, refresh, remaining)


async def start_session(
    db: AsyncSession, user: User, response: Response, *, mfa_verified: bool = False
) -> Session:
    now = utcnow()
    session = Session(
        user_id=user.id,
        expires_at=now + timedelta(seconds=get_settings().session_ttl_seconds),
        mfa_verified=mfa_verified or user.role not in MFA_REQUIRED_ROLES,
    )
    _issue_tokens(session, response, now)
    db.add(session)
    await db.flush()
    return session


async def rotate(db: AsyncSession, refresh_token: str, response: Response) -> Session | None:
    """Swap a refresh token for a new pair. Reuse of an old token revokes the whole session."""
    now = utcnow()
    token_hash = hash_token(refresh_token)
    session = await db.scalar(
        select(Session).where(Session.refresh_token_hash == token_hash).with_for_update()
    )
    if session is None:
        stolen = await db.scalar(
            select(Session).where(Session.previous_refresh_hash == token_hash).with_for_update()
        )
        if stolen is not None and stolen.revoked_at is None:
            stolen.revoked_at = now
            audit(
                db,
                actor=stolen.user_id,
                action="session.refresh_reuse",
                target_type="session",
                target_id=stolen.id,
            )
        return None
    if session.revoked_at is not None or session.expires_at <= now:
        return None
    session.previous_refresh_hash = token_hash
    _issue_tokens(session, response, now)
    return session


async def find_active(db: AsyncSession, access_token: str) -> tuple[Session, User] | None:
    now = utcnow()
    row = (
        await db.execute(
            select(Session, User)
            .join(User, User.id == Session.user_id)
            .where(
                Session.access_token_hash == hash_token(access_token),
                Session.revoked_at.is_(None),
                Session.access_expires_at > now,
                Session.expires_at > now,
            )
        )
    ).first()
    return (row[0], row[1]) if row else None


async def revoke_all(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def clear_auth_cookies(response: Response) -> None:
    clear_cookie(response, ACCESS_COOKIE)
    clear_cookie(response, REFRESH_COOKIE)
