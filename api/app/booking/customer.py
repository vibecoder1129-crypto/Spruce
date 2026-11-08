"""Customer booking: open times, booking, my bookings, moving and cancelling (slice 5b).

Slots are computed from shifts, time off and bookings (HLD 4.4). Booking re-checks the rules and
the EXCLUDE constraint still decides overlaps (LLD 5.1).
"""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import email as mail
from app.audit import audit
from app.booking.models import Booking, BookingSource, BookingStatus, TimeOff, WeeklyShift
from app.booking.router import (
    CHANGEABLE,
    GUEST_CONTEXT,
    _bookable,
    _fits,
    _flush_booking,
    _zone,
)
from app.booking.schemas import (
    AvailabilityOut,
    CustomerBookingIn,
    MyBooking,
    MyBookingsOut,
    RescheduleIn,
    Slot,
)
from app.business.models import Business, Location, StaffProfile
from app.crypto import encrypt
from app.identity.deps import Auth, Db
from app.identity.models import User
from app.identity.router import user_email
from app.marketplace.router import NOT_FOUND, Customer, _listed
from app.models_base import utcnow
from app.ratelimit import hit
from app.team.models import Service, StaffService

router = APIRouter(tags=["booking"])

STEP = timedelta(minutes=15)
DAYS_AHEAD = 60
MAX_AT_ONE_VENUE = 2
MAX_UPCOMING = 6
NOT_YOURS = "Booking not found."


def _check_day(day: date, today: date) -> None:
    if not today <= day <= today + timedelta(days=DAYS_AHEAD):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Pick a day from today to {DAYS_AHEAD} days ahead.",
        )


async def _public(db: AsyncSession, business_id: uuid.UUID) -> Business:
    business = await db.scalar(select(Business).where(Business.id == business_id, _listed()))
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return business


# --- open times ------------------------------------------------------------------------------


async def _open_times(
    db: AsyncSession, staff: StaffProfile, zone: str, day: date, minutes: int
) -> list[str]:
    tz = ZoneInfo(zone)
    shift = await db.scalar(
        select(WeeklyShift).where(
            WeeklyShift.staff_id == staff.id,
            WeeklyShift.week_start == day - timedelta(days=day.weekday()),
            WeeklyShift.day == day.weekday(),
        )
    )
    if shift is None:
        return []
    opens = datetime.combine(day, shift.starts, tz)
    closes = datetime.combine(day, shift.ends, tz)
    busy = [
        (a, b)
        for a, b in (
            await db.execute(
                select(TimeOff.starts_at, TimeOff.ends_at).where(
                    TimeOff.staff_id == staff.id,
                    TimeOff.starts_at < closes,
                    TimeOff.ends_at > opens,
                )
            )
        ).all()
    ]
    busy += [
        (a, b)
        for a, b in (
            await db.execute(
                select(Booking.starts_at, Booking.ends_at).where(
                    Booking.staff_id == staff.id,
                    Booking.status != BookingStatus.cancelled,
                    Booking.starts_at < closes,
                    Booking.ends_at > opens,
                )
            )
        ).all()
    ]
    now = utcnow()
    length = timedelta(minutes=minutes)
    times = []
    wall = datetime.combine(day, shift.starts)
    while wall + length <= datetime.combine(day, shift.ends):
        start = wall.replace(tzinfo=tz).astimezone(UTC)
        end = start + length
        exists = start.astimezone(tz).replace(tzinfo=None) == wall  # skip times DST skips
        if exists and start > now and not any(a < end and b > start for a, b in busy):
            times.append(wall.strftime("%H:%M"))
        wall += STEP
    return times


@router.get("/marketplace/businesses/{business_id}/availability")
async def availability(
    business_id: uuid.UUID,
    db: Db,
    service_id: uuid.UUID,
    day: Annotated[date, Query(alias="date")],
    staff_id: uuid.UUID | None = None,
) -> AvailabilityOut:
    business = await _public(db, business_id)
    query = (
        select(StaffProfile)
        .join(StaffService, StaffService.staff_id == StaffProfile.id)
        .join(Service, Service.id == StaffService.service_id)
        .where(
            StaffProfile.business_id == business.id,
            StaffProfile.active.is_(True),
            Service.id == service_id,
            Service.business_id == business.id,
            Service.active.is_(True),
        )
        .order_by(StaffProfile.created_at)
    )
    if staff_id is not None:
        query = query.where(StaffProfile.id == staff_id)
    team = list(await db.scalars(query))
    zone = await _zone(db, team[0]) if team else "Europe/Riga"
    _check_day(day, datetime.now(ZoneInfo(zone)).date())
    slots: list[tuple[str, int, uuid.UUID]] = []
    minutes = (await db.get_one(Service, service_id)).duration_minutes if team else 0
    for order, staff in enumerate(team):
        staff_zone = await _zone(db, staff)
        for time in await _open_times(db, staff, staff_zone, day, minutes):
            slots.append((time, order, staff.id))
    slots.sort()
    return AvailabilityOut(
        date=day,
        timezone=zone,
        slots=[Slot(staff_id=staff_id, time=time) for time, _, staff_id in slots],
    )


# --- my bookings -----------------------------------------------------------------------------


def _can_change(booking: Booking) -> bool:
    return booking.status in CHANGEABLE and booking.starts_at > utcnow()


async def _mine(db: AsyncSession, booking: Booking) -> MyBooking:
    row = (
        await db.execute(
            select(Business.name, Location.name, Location.address_text, Location.timezone)
            .join(Location, Location.business_id == Business.id)
            .where(Business.id == booking.business_id, Location.id == booking.location_id)
        )
    ).one()
    service = await db.get_one(Service, booking.service_id)
    staff = await db.get_one(StaffProfile, booking.staff_id)
    tz = ZoneInfo(row[3])
    return MyBooking(
        id=booking.id,
        business_id=booking.business_id,
        business_name=row[0],
        location_name=row[1],
        address=row[2],
        service_id=service.id,
        service_name=service.name,
        staff_id=staff.id,
        staff_name=staff.display_name,
        start=booking.starts_at.astimezone(tz).strftime("%Y-%m-%dT%H:%M"),
        end=booking.ends_at.astimezone(tz).strftime("%Y-%m-%dT%H:%M"),
        timezone=row[3],
        status=booking.status,
        price_minor=booking.price_minor,
        currency=booking.currency,
        can_change=_can_change(booking),
    )


@router.get("/me/bookings")
async def my_bookings(auth: Customer, db: Db) -> MyBookingsOut:
    rows = list(await db.scalars(select(Booking).where(Booking.consumer_user_id == auth.user.id)))
    now = utcnow()
    upcoming = sorted(
        (b for b in rows if b.ends_at > now and b.status != BookingStatus.cancelled),
        key=lambda b: b.starts_at,
    )
    past = sorted((b for b in rows if b not in upcoming), key=lambda b: b.starts_at, reverse=True)
    return MyBookingsOut(
        upcoming=[await _mine(db, b) for b in upcoming],
        past=[await _mine(db, b) for b in past],
    )


# --- emails ----------------------------------------------------------------------------------


async def notify(db: AsyncSession, booking: Booking, what: str) -> None:
    """Tell the customer, if the booking has one, that it was confirmed, moved or cancelled."""
    if booking.consumer_user_id is None:
        return
    user = await db.get_one(User, booking.consumer_user_id)
    mine = await _mine(db, booking)
    when = mine.start.replace("T", " at ")
    subject = {
        "confirmed": f"Booking confirmed: {mine.service_name} at {mine.business_name}",
        "moved": f"Booking moved: {mine.service_name} at {mine.business_name}",
        "cancelled": f"Booking cancelled: {mine.service_name} at {mine.business_name}",
    }[what]
    lines = [
        f"{mine.service_name} with {mine.staff_name}",
        f"{when} ({mine.timezone.replace('_', ' ')} time)",
        f"{mine.business_name}, {mine.address}",
    ]
    if what != "cancelled":
        price = f"{mine.price_minor / 100:.2f} {mine.currency}"
        lines.append(f"Price: {price}, paid at the venue.")
    await mail.send(mail.Email(to=user_email(user), subject=subject, text="\n".join(lines)))


# --- booking ---------------------------------------------------------------------------------


async def _limits(db: AsyncSession, auth: Auth, business_id: uuid.UUID) -> None:
    upcoming = (
        select(Booking.business_id)
        .where(
            Booking.consumer_user_id == auth.user.id,
            Booking.status.in_(CHANGEABLE),
            Booking.ends_at > utcnow(),
        )
        .subquery()
    )
    total = await db.scalar(select(func.count()).select_from(upcoming)) or 0
    here = (
        await db.scalar(
            select(func.count()).select_from(upcoming).where(upcoming.c.business_id == business_id)
        )
        or 0
    )
    if here >= MAX_AT_ONE_VENUE:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"You already have {here} upcoming bookings here. Cancel one to book another.",
        )
    if total >= MAX_UPCOMING:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"You already have {total} upcoming bookings. Cancel one to book another.",
        )


async def _place(
    db: AsyncSession,
    business_id: uuid.UUID,
    staff_id: uuid.UUID,
    service_id: uuid.UUID,
    start: datetime,
) -> tuple[StaffProfile, Service, datetime, datetime]:
    staff, service = await _bookable(db, business_id, staff_id, service_id)
    zone = await _zone(db, staff)
    _check_day(start.date(), datetime.now(ZoneInfo(zone)).date())
    starts_at, ends_at = await _fits(db, staff, start, service.duration_minutes)
    if starts_at <= utcnow():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="That time has already passed.")
    return staff, service, starts_at, ends_at


@router.post("/bookings", status_code=status.HTTP_201_CREATED)
async def book(body: CustomerBookingIn, auth: Customer, db: Db) -> MyBooking:
    await hit("booking", str(auth.user.id), limit=10, window_seconds=3600)
    service = await db.scalar(select(Service).where(Service.id == body.service_id))
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    business = await _public(db, service.business_id)
    await _limits(db, auth, business.id)
    staff, service, starts_at, ends_at = await _place(
        db, business.id, body.staff_id, body.service_id, body.start
    )
    guest = {"name": body.name, **({"phone": body.phone} if body.phone else {})}
    booking = Booking(
        business_id=business.id,
        location_id=staff.location_id,
        staff_id=staff.id,
        service_id=service.id,
        consumer_user_id=auth.user.id,
        guest_encrypted=encrypt(json.dumps(guest), GUEST_CONTEXT),
        starts_at=starts_at,
        ends_at=ends_at,
        status=BookingStatus.confirmed,
        source=BookingSource.consumer,
        notes=body.notes,
        price_minor=service.price_minor,
        currency=service.currency,
        created_by_user_id=auth.user.id,
    )
    db.add(booking)
    await _flush_booking(db)
    audit(
        db, actor=auth.user.id, action="booking.create", target_type="booking", target_id=booking.id
    )
    await db.commit()
    await notify(db, booking, "confirmed")
    return await _mine(db, booking)


async def _own(db: AsyncSession, auth: Auth, booking_id: uuid.UUID) -> Booking:
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id, Booking.consumer_user_id == auth.user.id)
        .with_for_update()
    )
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_YOURS)
    if not _can_change(booking):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This booking can't be changed now.")
    return booking


async def cancel_own(db: AsyncSession, auth: Auth, booking_id: uuid.UUID) -> MyBooking:
    """The customer's side of PATCH /bookings/{id}/cancel."""
    booking = await _own(db, auth, booking_id)
    booking.status = BookingStatus.cancelled
    booking.cancelled_at = utcnow()
    audit(
        db, actor=auth.user.id, action="booking.cancel", target_type="booking", target_id=booking.id
    )
    await db.commit()
    await notify(db, booking, "cancelled")
    return await _mine(db, booking)


@router.patch("/bookings/{booking_id}/reschedule")
async def reschedule(
    booking_id: uuid.UUID, body: RescheduleIn, auth: Customer, db: Db
) -> MyBooking:
    booking = await _own(db, auth, booking_id)
    staff, _, starts_at, ends_at = await _place(
        db, booking.business_id, body.staff_id or booking.staff_id, booking.service_id, body.start
    )
    booking.staff_id, booking.location_id = staff.id, staff.location_id
    booking.starts_at, booking.ends_at = starts_at, ends_at
    audit(
        db, actor=auth.user.id, action="booking.update", target_type="booking", target_id=booking.id
    )
    await _flush_booking(db)
    await db.commit()
    await notify(db, booking, "moved")
    return await _mine(db, booking)
