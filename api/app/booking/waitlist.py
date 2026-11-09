"""Waitlist (slice 7): customers wait for a service on a full day and hear when a time frees up.

Everyone waiting is told at once, a single time; the first to book wins and the EXCLUDE constraint
still decides.
"""

import uuid
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import email as mail
from app.booking import customer
from app.booking.models import Booking, WaitlistEntry
from app.booking.router import _actor, _zone
from app.booking.schemas import MyWaitlistEntry, WaitingOut, WaitlistIn
from app.business.models import Business, StaffProfile
from app.config import get_settings
from app.crypto import decrypt, encrypt
from app.identity.deps import Db, FullySignedIn
from app.identity.models import User
from app.identity.router import user_email
from app.marketplace.router import NOT_FOUND, Customer
from app.models_base import utcnow
from app.ratelimit import hit
from app.team.models import Flag, Service

router = APIRouter(tags=["waitlist"])

NAME_CONTEXT = "waitlist.name"
MAX_WAITING = 5
GONE = "Waitlist entry not found."


async def _today(db: AsyncSession, business_id: uuid.UUID) -> datetime:
    staff = await db.scalar(select(StaffProfile).where(StaffProfile.business_id == business_id))
    zone = await _zone(db, staff) if staff else "Europe/Riga"
    return datetime.now(ZoneInfo(zone))


@router.post("/me/waitlist", status_code=status.HTTP_201_CREATED)
async def join(body: WaitlistIn, auth: Customer, db: Db) -> MyWaitlistEntry:
    await hit("waitlist", str(auth.user.id), limit=20, window_seconds=3600)
    service = await db.get(Service, body.service_id)
    if service is None or not service.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    business = await customer._public(db, service.business_id)
    _, slots = await customer.open_slots(db, business.id, service.id, body.date)
    if slots:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="This day still has open times. Book one of those."
        )
    today = (await _today(db, business.id)).date()
    waiting = await db.scalar(
        select(func.count()).where(
            WaitlistEntry.consumer_user_id == auth.user.id, WaitlistEntry.day >= today
        )
    )
    if (waiting or 0) >= MAX_WAITING:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"You're already waiting for {MAX_WAITING} days. Leave one to join another.",
        )
    entry = WaitlistEntry(
        business_id=business.id,
        service_id=service.id,
        consumer_user_id=auth.user.id,
        day=body.date,
        name_encrypted=encrypt(body.name, NAME_CONTEXT),
    )
    db.add(entry)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="You're already on the waitlist for that day."
        ) from None
    await db.commit()
    return MyWaitlistEntry(
        id=entry.id,
        business_id=business.id,
        business_name=business.name,
        service_id=service.id,
        service_name=service.name,
        date=entry.day,
        notified=False,
    )


@router.get("/me/waitlist")
async def mine(auth: Customer, db: Db) -> list[MyWaitlistEntry]:
    rows = await db.execute(
        select(WaitlistEntry, Business.name, Service.name)
        .join(Business, Business.id == WaitlistEntry.business_id)
        .join(Service, Service.id == WaitlistEntry.service_id)
        .where(
            WaitlistEntry.consumer_user_id == auth.user.id,
            WaitlistEntry.day >= datetime.now(ZoneInfo(auth.user.timezone)).date(),
        )
        .order_by(WaitlistEntry.day)
    )
    return [
        MyWaitlistEntry(
            id=e.id,
            business_id=e.business_id,
            business_name=business_name,
            service_id=e.service_id,
            service_name=service_name,
            date=e.day,
            notified=e.notified_at is not None,
        )
        for e, business_name, service_name in rows.all()
    ]


@router.delete("/me/waitlist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave(entry_id: uuid.UUID, auth: Customer, db: Db) -> Response:
    gone = await db.execute(
        delete(WaitlistEntry).where(
            WaitlistEntry.id == entry_id, WaitlistEntry.consumer_user_id == auth.user.id
        )
    )
    if gone.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=GONE)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/businesses/{business_id}/waitlist")
async def waiting(
    business_id: uuid.UUID,
    day: Annotated[date, Query(alias="date")],
    auth: FullySignedIn,
    db: Db,
) -> list[WaitingOut]:
    actor = await _actor(db, auth, business_id, "Business not found.")
    if actor.staff is not None and Flag.calendar_view not in actor.flags:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't see the calendar.")
    rows = await db.execute(
        select(WaitlistEntry, Service.name)
        .join(Service, Service.id == WaitlistEntry.service_id)
        .where(WaitlistEntry.business_id == business_id, WaitlistEntry.day == day)
        .order_by(WaitlistEntry.created_at)
    )
    return [
        WaitingOut(
            id=e.id,
            name=decrypt(e.name_encrypted, NAME_CONTEXT),
            service_name=service_name,
            joined_at=e.created_at,
            notified=e.notified_at is not None,
        )
        for e, service_name in rows.all()
    ]


async def booked(db: AsyncSession, booking: Booking) -> None:
    """A customer who books the service they were waiting for that day is no longer waiting."""
    staff = await db.get_one(StaffProfile, booking.staff_id)
    day = booking.starts_at.astimezone(ZoneInfo(await _zone(db, staff))).date()
    await db.execute(
        delete(WaitlistEntry).where(
            WaitlistEntry.consumer_user_id == booking.consumer_user_id,
            WaitlistEntry.service_id == booking.service_id,
            WaitlistEntry.day == day,
        )
    )


async def offer(
    db: AsyncSession, business_id: uuid.UUID, staff_id: uuid.UUID, freed: datetime
) -> None:
    """A time was freed: email everyone waiting that day whose service can now be booked."""
    staff = await db.get_one(StaffProfile, staff_id)
    zone = ZoneInfo(await _zone(db, staff))
    day = freed.astimezone(zone).date()
    if day < datetime.now(zone).date():
        return
    entries = list(
        await db.scalars(
            select(WaitlistEntry).where(
                WaitlistEntry.business_id == business_id,
                WaitlistEntry.day == day,
                WaitlistEntry.notified_at.is_(None),
            )
        )
    )
    if not entries:
        return
    business = await db.get_one(Business, business_id)
    base = get_settings().app_base_url
    open_services: dict[uuid.UUID, bool] = {}
    for entry in entries:
        if entry.service_id not in open_services:
            _, slots = await customer.open_slots(db, business_id, entry.service_id, day)
            open_services[entry.service_id] = bool(slots)
        if not open_services[entry.service_id]:
            continue
        service = await db.get_one(Service, entry.service_id)
        user = await db.get_one(User, entry.consumer_user_id)
        link = f"{base}/b/{business_id}/book?service={service.id}&staff=any&date={day.isoformat()}"
        await mail.send(
            mail.Email(
                to=user_email(user),
                subject=f"A time opened up: {service.name} at {business.name}",
                text="\n".join(
                    [
                        f"A time for {service.name} on {day:%A %d %B} is free at {business.name}.",
                        "It goes to whoever books first.",
                        f"Book it: {link}",
                    ]
                ),
            )
        )
        entry.notified_at = utcnow()
    await db.commit()
