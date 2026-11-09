"""Which room or piece of equipment a visit uses (slice 12).

The EXCLUDE constraint no_double_resource is still the authority: picking here only chooses a
free one up front, and a race loses with a 409 like any other double booking.
"""

import uuid
from collections.abc import Callable
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.booking.models import Booking, BookingStatus
from app.team.models import Resource, ServiceResource

NO_ROOM = "No room or equipment for this service is free then."

Fits = Callable[[datetime, datetime], bool]


async def _needed(
    db: AsyncSession, service_id: uuid.UUID, location_id: uuid.UUID
) -> list[uuid.UUID] | None:
    """None when the service needs nothing; else its resources at this location (maybe none)."""
    linked = await db.scalar(select(exists().where(ServiceResource.service_id == service_id)))
    if not linked:
        return None
    return list(
        await db.scalars(
            select(Resource.id)
            .join(ServiceResource, ServiceResource.resource_id == Resource.id)
            .where(ServiceResource.service_id == service_id, Resource.location_id == location_id)
            .order_by(Resource.created_at)
        )
    )


async def _busy(
    db: AsyncSession,
    ids: list[uuid.UUID],
    starts: datetime,
    ends: datetime,
    booking_id: uuid.UUID | None = None,
) -> list[tuple[uuid.UUID, datetime, datetime]]:
    query = select(Booking.resource_id, Booking.starts_at, Booking.ends_at).where(
        Booking.resource_id.in_(ids),
        Booking.status != BookingStatus.cancelled,
        Booking.starts_at < ends,
        Booking.ends_at > starts,
    )
    if booking_id is not None:
        query = query.where(Booking.id != booking_id)
    return [(r, a, b) for r, a, b in (await db.execute(query)).all() if r is not None]


async def pick(
    db: AsyncSession,
    service_id: uuid.UUID,
    location_id: uuid.UUID,
    starts_at: datetime,
    ends_at: datetime,
    booking: Booking | None = None,
) -> uuid.UUID | None:
    """A free resource for the visit, keeping the booking's own when it still fits."""
    ids = await _needed(db, service_id, location_id)
    if ids is None:
        return None
    busy = {
        r for r, _, _ in await _busy(db, ids, starts_at, ends_at, booking.id if booking else None)
    }
    free = [r for r in ids if r not in busy]
    if not free:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=NO_ROOM)
    if booking is not None and booking.resource_id in free:
        return booking.resource_id
    return free[0]


async def checker(
    db: AsyncSession,
    service_id: uuid.UUID,
    location_id: uuid.UUID,
    opens: datetime,
    closes: datetime,
) -> Fits | None:
    """For availability: whether some resource is free for a given start and end that day."""
    ids = await _needed(db, service_id, location_id)
    if ids is None:
        return None
    busy = await _busy(db, ids, opens, closes)

    def fits(start: datetime, end: datetime) -> bool:
        return any(not any(r == rid and a < end and b > start for r, a, b in busy) for rid in ids)

    return fits


async def name(db: AsyncSession, resource_id: uuid.UUID | None) -> str | None:
    if resource_id is None:
        return None
    return await db.scalar(select(Resource.name).where(Resource.id == resource_id))
