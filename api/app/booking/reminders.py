"""Rebooking reminders (slice 9): one email per finished visit, when the client is usually due back.

Run daily with `python -m app.cli send-reminders`.
"""

import base64
import hmac
import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app import email as mail
from app.booking.models import Booking, BookingStatus
from app.business.models import ApprovalStatus, Business
from app.business.schemas import Strict
from app.config import get_settings
from app.crypto import blind_index
from app.identity.deps import Db
from app.identity.models import User
from app.identity.router import user_email
from app.models_base import utcnow
from app.ratelimit import hit
from app.team.models import Service

GRACE = timedelta(days=7)  # due visits older than this are left alone, so turning it on never spams
STOP_CONTEXT = "rebook.stop"

router = APIRouter(tags=["reminders"])


def stop_token(user_id: uuid.UUID) -> str:
    """Lets the email's link turn reminders off without logging in, for this user only."""
    digest = blind_index(str(user_id), STOP_CONTEXT)
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def interval(weeks: int) -> str:
    return "6 months" if weeks == 26 else f"{weeks} weeks"


class StopIn(Strict):
    user_id: uuid.UUID
    token: str


@router.post("/emails/stop", status_code=status.HTTP_204_NO_CONTENT)
async def stop(body: StopIn, db: Db) -> Response:
    await hit("emails-stop", str(body.user_id), limit=20, window_seconds=3600)
    if not hmac.compare_digest(stop_token(body.user_id), body.token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="This link doesn't work.")
    gone = await db.execute(
        update(User).where(User.id == body.user_id).values(rebook_reminders=False)
    )
    if gone.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="This link doesn't work.")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def send_reminders(db: AsyncSession) -> int:
    now = utcnow()
    later = aliased(Booking)
    due_at = Booking.ends_at + func.make_interval(0, 0, Service.rebook_weeks)
    rows = (
        await db.execute(
            select(Booking, Service, Business, User)
            .join(Service, Service.id == Booking.service_id)
            .join(Business, Business.id == Booking.business_id)
            .join(User, User.id == Booking.consumer_user_id)
            .where(
                Booking.status == BookingStatus.completed,
                Booking.rebook_reminded_at.is_(None),
                Service.rebook_weeks > 0,
                Service.active.is_(True),
                User.rebook_reminders.is_(True),
                Business.approval_status == ApprovalStatus.approved,
                due_at <= now,
                due_at > now - GRACE,
                # Already back, or already booked: nothing to remind.
                ~exists().where(
                    later.consumer_user_id == Booking.consumer_user_id,
                    later.business_id == Booking.business_id,
                    later.status != BookingStatus.cancelled,
                    later.starts_at > Booking.starts_at,
                ),
            )
            .with_for_update(of=Booking, skip_locked=True)
        )
    ).all()
    base = get_settings().app_base_url
    for booking, service, business, user in rows:
        link = f"{base}/b/{business.id}/book?service={service.id}&staff={booking.staff_id}"
        off = f"{base}/emails/stop?u={user.id}&t={stop_token(user.id)}"
        await mail.send(
            mail.Email(
                to=user_email(user),
                subject=f"Time for your next {service.name} at {business.name}?",
                text="\n".join(
                    [
                        f"It's been {interval(service.rebook_weeks)} since your {service.name}"
                        f" at {business.name}.",
                        f"Book the same again: {link}",
                        "",
                        f"Stop these reminders with one click: {off}",
                        f"Or change your email settings: {base}/account",
                    ]
                ),
            )
        )
        booking.rebook_reminded_at = now
    await db.commit()
    return len(rows)
