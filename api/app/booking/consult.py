"""Consultation forms and patch tests (slice 13): what a visit needs from its customer."""

import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.booking.models import Booking, CustomerProfile, FormAnswers
from app.booking.schemas import FormState
from app.team.models import Service

PATCH_TEST_LEAD = timedelta(hours=48)
PATCH_TEST_VALID = timedelta(days=180)
NEEDS_PATCH_TEST = (
    "This service needs a patch test at the venue at least 48 hours before, and within the last"
    " 6 months. Contact the venue to arrange one."
)


async def form_state(db: AsyncSession, booking: Booking, service: Service) -> FormState:
    if await db.get(FormAnswers, booking.id) is not None:
        return "filled"
    return "to_fill" if service.form_id is not None else "none"


async def patch_test_at(
    db: AsyncSession, business_id: uuid.UUID, user_id: uuid.UUID | None
) -> datetime | None:
    if user_id is None:
        return None
    return await db.scalar(
        select(CustomerProfile.patch_test_at).where(
            CustomerProfile.business_id == business_id,
            CustomerProfile.consumer_user_id == user_id,
        )
    )


async def check_patch_test(
    db: AsyncSession, user_id: uuid.UUID, service: Service, starts_at: datetime
) -> None:
    """Online bookings of such a service need a recent enough, early enough patch test."""
    if not service.needs_patch_test:
        return
    done = await patch_test_at(db, service.business_id, user_id)
    if done is None or not starts_at - PATCH_TEST_VALID <= done <= starts_at - PATCH_TEST_LEAD:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=NEEDS_PATCH_TEST)
