from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cookies import ACCESS_COOKIE
from app.db import get_session
from app.identity.models import MFA_REQUIRED_ROLES, Session, User
from app.identity.sessions import find_active

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
    return Auth(*found)


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
