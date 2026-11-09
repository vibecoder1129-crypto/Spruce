"""Admin support mode (slice 8): an owner lets a platform admin help as them, and sees the log.

The per-request rules (access still on, no account changes, every change audited) live in
`app.identity.deps`, so they hold for every endpoint.
"""

import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select, update

from app.audit import AuditLog, audit
from app.business.models import Business
from app.business.router import NOT_FOUND, Admin, Owner, _owned
from app.business.schemas import SupportAction, SupportIn, SupportOut
from app.identity.deps import Auth, Db
from app.identity.models import Session, User
from app.identity.router import me_out
from app.identity.schemas import MeOut
from app.identity.sessions import start_session
from app.models_base import utcnow

router = APIRouter(tags=["support"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

SESSION = timedelta(hours=1)


def _off(business: Business) -> bool:
    return business.support_until is None or business.support_until <= utcnow()


@router.put("/businesses/{business_id}/support")
async def set_support(business_id: uuid.UUID, body: SupportIn, auth: Owner, db: Db) -> SupportOut:
    business = await _owned(db, auth, business_id)
    if body.hours:
        business.support_until = utcnow() + timedelta(hours=body.hours)
        audit(
            db,
            actor=auth.user.id,
            action="support.allow",
            target_type="business",
            target_id=business.id,
            hours=body.hours,
        )
    else:
        business.support_until = None
        await db.execute(
            update(Session)
            .where(
                Session.user_id == auth.user.id,
                Session.support_admin_id.is_not(None),
                Session.revoked_at.is_(None),
            )
            .values(revoked_at=utcnow())
        )
        audit(
            db,
            actor=auth.user.id,
            action="support.end",
            target_type="business",
            target_id=business.id,
        )
    await db.commit()
    return await _state(db, business)


@router.get("/businesses/{business_id}/support")
async def get_support(business_id: uuid.UUID, auth: Owner, db: Db) -> SupportOut:
    business = await _owned(db, auth, business_id)
    state = await _state(db, business)
    await db.rollback()
    return state


async def _state(db: Db, business: Business) -> SupportOut:
    rows = await db.scalars(
        select(AuditLog)
        .where(
            AuditLog.action_type == "support.action",
            AuditLog.target_type == "business",
            AuditLog.target_id == str(business.id),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )
    return SupportOut(
        until=None if _off(business) else business.support_until,
        log=[
            SupportAction(
                at=r.created_at, method=r.metadata_json["method"], path=r.metadata_json["path"]
            )
            for r in rows
        ],
    )


@admin_router.post("/businesses/{business_id}/support")
async def start_support(business_id: uuid.UUID, auth: Admin, response: Response, db: Db) -> MeOut:
    business = await db.get(Business, business_id)
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    if _off(business):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="The owner hasn't turned on support access."
        )
    owner = await db.get_one(User, business.owner_user_id)
    ends = min(utcnow() + SESSION, business.support_until)  # type: ignore[type-var]
    # This browser becomes the owner's for now; the admin's own session ends here.
    auth.session.revoked_at = utcnow()
    session = await start_session(
        db, owner, response, mfa_verified=True, support_admin_id=auth.user.id, ends=ends
    )
    audit(
        db,
        actor=auth.user.id,
        action="support.start",
        target_type="business",
        target_id=business.id,
    )
    await db.commit()
    return me_out(Auth(session, owner))
