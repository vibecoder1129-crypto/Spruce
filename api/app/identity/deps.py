from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.business.models import Business
from app.cookies import ACCESS_COOKIE
from app.db import get_session
from app.identity.models import MFA_REQUIRED_ROLES, Session, User
from app.identity.sessions import find_active
from app.models_base import utcnow

Db = Annotated[AsyncSession, Depends(get_session)]


@dataclass
class Auth:
    session: Session
    user: User

    @property
    def mfa_pending(self) -> bool:
        return self.user.role in MFA_REQUIRED_ROLES and not self.session.mfa_verified


async def signed_in(request: Request, db: Db) -> Auth:
    """Any live session, including one that still owes an MFA step."""
    token = request.cookies.get(ACCESS_COOKIE.name)
    found = await find_active(db, token) if token else None
    if found is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Please log in.")
    auth = Auth(*found)
    if auth.session.support_admin_id is not None:
        await _support_guard(request, db, auth)
    return auth


# Support mode may refresh and sign out, nothing else about the owner's account (slice 8).
SUPPORT_AUTH_PATHS = {"/auth/csrf", "/auth/refresh", "/auth/logout"}


async def _support_guard(request: Request, db: AsyncSession, auth: Auth) -> None:
    """Ends support once the owner's access lapses, keeps it off the account, logs every change."""
    business = await db.scalar(select(Business).where(Business.owner_user_id == auth.user.id))
    if business is None or business.support_until is None or business.support_until <= utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Support access has ended.")
    path = request.url.path
    if (path.startswith("/auth/") and path not in SUPPORT_AUTH_PATHS) or path.endswith(
        f"/businesses/{business.id}/support"
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not available in support mode.")
    if request.method not in ("GET", "HEAD") and path != "/auth/logout":
        audit(
            db,
            actor=auth.session.support_admin_id,
            action="support.action",
            target_type="business",
            target_id=business.id,
            method=request.method,
            path=path,
        )
        await db.commit()  # logged even if the change itself fails


async def fully_signed_in(auth: Annotated[Auth, Depends(signed_in)]) -> Auth:
    """A session that has passed every required factor. Use this for all real work."""
    if auth.mfa_pending:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="mfa_required")
    return auth


SignedIn = Annotated[Auth, Depends(signed_in)]
FullySignedIn = Annotated[Auth, Depends(fully_signed_in)]


def client_ip(request: Request) -> str:
    # Behind the reverse proxy, uvicorn's --proxy-headers sets request.client from
    # X-Forwarded-For, trusting only the proxy's address (--forwarded-allow-ips).
    return request.client.host if request.client else "unknown"
