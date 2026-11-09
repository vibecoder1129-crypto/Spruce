"""Rebooking reminders (slice 9): one email per finished visit, when the client is usually due back.

Run daily with `python -m app.cli send-reminders`.
"""

from datetime import timedelta

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app import email as mail
from app.booking.models import Booking, BookingStatus
from app.business.models import ApprovalStatus, Business
from app.config import get_settings
from app.identity.models import User
from app.identity.router import user_email
from app.models_base import utcnow
from app.team.models import Service

GRACE = timedelta(days=7)  # due visits older than this are left alone, so turning it on never spams


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
        await mail.send(
            mail.Email(
                to=user_email(user),
                subject=f"Time for your next {service.name} at {business.name}?",
                text="\n".join(
                    [
                        f"It's been {service.rebook_weeks} weeks since your {service.name}"
                        f" at {business.name}.",
                        f"Book the same again: {link}",
                        "",
                        f"Don't want these reminders? Turn them off here: {base}/account",
                    ]
                ),
            )
        )
        booking.rebook_reminded_at = now
    await db.commit()
    return len(rows)
