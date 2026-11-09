"""Shifts, time off, the day board and owner bookings (LLD 3.3, 4.2, 4.4, 5.1; HLD 4.4-4.6, 9)."""

import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.booking import resources
from app.booking.models import (
    Booking,
    BookingSource,
    BookingStatus,
    CustomerProfile,
    TimeOff,
    WeeklyShift,
)
from app.booking.schemas import (
    BookableService,
    BookingDetail,
    BookingOut,
    BookingPatch,
    CalendarOut,
    ChannelCount,
    Column,
    DayShift,
    MyBooking,
    PlaceOut,
    ShiftOut,
    ShiftsIn,
    TimeOffIn,
    TimeOffOut,
    WalkInIn,
    WeekDay,
    WeekOut,
)
from app.business.models import Business, Location, StaffProfile
from app.business.router import Owner, _owned
from app.crypto import decrypt, encrypt
from app.identity.deps import Auth, Db, FullySignedIn
from app.identity.models import Role
from app.models_base import utcnow
from app.team.models import Flag, PermissionGrant, Service, StaffService
from app.team.router import StaffUser, _me, _owned_staff

router = APIRouter(tags=["calendar"])

GUEST_CONTEXT = "bookings.guest"
BOOKING_NOT_FOUND = "Appointment not found."
TAKEN = "That time was just taken."
CHANGEABLE = (BookingStatus.pending, BookingStatus.confirmed)

Week = Annotated[date, Query(description="The Monday the week starts on")]


def _monday(week: date) -> date:
    if week.weekday() != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Pick a Monday.")
    return week


def _local(value: datetime, zone: str) -> datetime:
    """A wall-clock time at the location, as a UTC instant. Times the clocks skip are refused."""
    tz = ZoneInfo(zone)
    instant = value.replace(tzinfo=tz).astimezone(UTC)
    if instant.astimezone(tz).replace(tzinfo=None) != value:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That time doesn't exist on this day because the clocks change.",
        )
    return instant


def _shift_out(shift: WeeklyShift) -> ShiftOut:
    return ShiftOut(staff_id=shift.staff_id, day=shift.day, starts=shift.starts, ends=shift.ends)


def _time_off_out(block: TimeOff) -> TimeOffOut:
    return TimeOffOut(
        id=block.id,
        staff_id=block.staff_id,
        starts_at=block.starts_at.astimezone(UTC),
        ends_at=block.ends_at.astimezone(UTC),
        reason=block.reason,
    )


# --- who is asking ---------------------------------------------------------------------------


@dataclass
class Actor:
    """The owner, or a staff member with their flags. Owners can do everything here."""

    business: Business
    staff: StaffProfile | None = None
    flags: set[Flag] = field(default_factory=set)

    @property
    def is_owner(self) -> bool:
        return self.staff is None

    def sees(self, staff_id: uuid.UUID) -> bool:
        if self.staff is None:
            return True
        if Flag.calendar_view not in self.flags:
            return False
        return Flag.calendar_team in self.flags or staff_id == self.staff.id

    def marks(self, staff_id: uuid.UUID) -> bool:
        if self.staff is None:
            return True
        return Flag.checkout_own in self.flags and staff_id == self.staff.id

    def books(self, staff_id: uuid.UUID) -> bool:
        if self.staff is None:
            return True
        return Flag.appointments_own in self.flags and staff_id == self.staff.id


async def _actor(db: AsyncSession, auth: Auth, business_id: uuid.UUID, missing: str) -> Actor:
    if auth.user.role is Role.owner:
        business = await db.scalar(
            select(Business).where(
                Business.id == business_id, Business.owner_user_id == auth.user.id
            )
        )
        if business is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=missing)
        return Actor(business)
    if auth.user.role is Role.staff:
        staff = await _me(db, auth)
        if staff.business_id != business_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=missing)
        business = await db.get_one(Business, business_id)
        flags = set(
            await db.scalars(
                select(PermissionGrant.flag_key).where(
                    PermissionGrant.staff_id == staff.id, PermissionGrant.revoked_at.is_(None)
                )
            )
        )
        return Actor(business, staff, flags)
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't do that.")


# --- shifts ----------------------------------------------------------------------------------


async def _week(db: AsyncSession, staff_ids: list[uuid.UUID], week: date) -> list[ShiftOut]:
    rows = await db.scalars(
        select(WeeklyShift)
        .where(WeeklyShift.staff_id.in_(staff_ids), WeeklyShift.week_start == week)
        .order_by(WeeklyShift.day, WeeklyShift.starts)
    )
    return [_shift_out(s) for s in rows]


async def _active_staff_ids(db: AsyncSession, business_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        await db.scalars(
            select(StaffProfile.id).where(
                StaffProfile.business_id == business_id, StaffProfile.active.is_(True)
            )
        )
    )


@router.get("/businesses/{business_id}/shifts")
async def get_shifts(business_id: uuid.UUID, week: Week, auth: Owner, db: Db) -> list[ShiftOut]:
    business = await _owned(db, auth, business_id)
    return await _week(db, await _active_staff_ids(db, business.id), _monday(week))


@router.put("/businesses/{business_id}/shifts")
async def set_shifts(
    business_id: uuid.UUID, week: Week, body: ShiftsIn, auth: Owner, db: Db
) -> list[ShiftOut]:
    # Owner only: shift.manage is never grantable (HLD 9). The business row lock serialises saves.
    business = await _owned(db, auth, business_id)
    monday = _monday(week)
    staff_ids = await _active_staff_ids(db, business.id)
    if not {s.staff_id for s in body.shifts} <= set(staff_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Team member not found.")
    await db.execute(
        delete(WeeklyShift).where(
            WeeklyShift.staff_id.in_(staff_ids), WeeklyShift.week_start == monday
        )
    )
    db.add_all(WeeklyShift(week_start=monday, **s.model_dump()) for s in body.shifts)
    audit(
        db,
        actor=auth.user.id,
        action="shifts.set",
        target_type="business",
        target_id=business.id,
        week=monday.isoformat(),
        count=len(body.shifts),
    )
    await db.commit()
    return await _week(db, staff_ids, monday)


@router.get("/me/shifts")
async def my_shifts(week: Week, auth: StaffUser, db: Db) -> list[ShiftOut]:
    staff = await _me(db, auth)
    return await _week(db, [staff.id], _monday(week))


# --- time off --------------------------------------------------------------------------------


async def _zone(db: AsyncSession, staff: StaffProfile) -> str:
    zone = await db.execute(select(Location.timezone).where(Location.id == staff.location_id))
    return zone.scalar_one()


@router.post("/staff/{staff_id}/time-off", status_code=status.HTTP_201_CREATED)
async def add_time_off(staff_id: uuid.UUID, body: TimeOffIn, auth: Owner, db: Db) -> TimeOffOut:
    staff = await _owned_staff(db, auth, staff_id)
    zone = await _zone(db, staff)
    block = TimeOff(
        staff_id=staff.id,
        starts_at=_local(body.start, zone),
        ends_at=_local(body.end, zone),
        reason=body.reason,
    )
    db.add(block)
    await db.flush()
    audit(db, actor=auth.user.id, action="time_off.create", target_type="staff", target_id=staff.id)
    await db.commit()
    return _time_off_out(block)


@router.delete("/time-off/{time_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_time_off(time_off_id: uuid.UUID, auth: Owner, db: Db) -> Response:
    block = await db.scalar(
        select(TimeOff)
        .join(StaffProfile, StaffProfile.id == TimeOff.staff_id)
        .join(Business, Business.id == StaffProfile.business_id)
        .where(TimeOff.id == time_off_id, Business.owner_user_id == auth.user.id)
    )
    if block is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Blocked time not found.")
    await db.delete(block)
    audit(
        db,
        actor=auth.user.id,
        action="time_off.delete",
        target_type="staff",
        target_id=block.staff_id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- bookings --------------------------------------------------------------------------------


def _guest(booking: Booking) -> dict[str, str | None]:
    if booking.guest_encrypted is None:
        return {}
    found: dict[str, str | None] = json.loads(decrypt(booking.guest_encrypted, GUEST_CONTEXT))
    return found


def _booking_out(booking: Booking, service_name: str, flags: list[str]) -> BookingOut:
    return BookingOut(
        id=booking.id,
        staff_id=booking.staff_id,
        service_id=booking.service_id,
        service_name=service_name,
        client_name=_guest(booking).get("name") or "Client",
        starts_at=booking.starts_at.astimezone(UTC),
        ends_at=booking.ends_at.astimezone(UTC),
        status=booking.status,
        source=booking.source,
        price_minor=booking.price_minor,
        currency=booking.currency,
        client_flags=flags,
    )


async def _flags(db: AsyncSession, bookings: list[Booking]) -> dict[uuid.UUID, list[str]]:
    """This venue's flags for each booking's customer. Walk-ins have no account, so no flags."""
    customers = {b.consumer_user_id for b in bookings if b.consumer_user_id is not None}
    if not customers:
        return {}
    profiles = {
        (p.business_id, p.consumer_user_id): p.flags
        for p in await db.scalars(
            select(CustomerProfile).where(
                CustomerProfile.business_id.in_({b.business_id for b in bookings}),
                CustomerProfile.consumer_user_id.in_(customers),
            )
        )
    }
    return {
        b.id: profiles.get((b.business_id, b.consumer_user_id), [])
        for b in bookings
        if b.consumer_user_id is not None
    }


async def _detail(db: AsyncSession, booking: Booking) -> BookingDetail:
    name = (
        await db.execute(select(Service.name).where(Service.id == booking.service_id))
    ).scalar_one()
    guest = _guest(booking)
    flags = (await _flags(db, [booking])).get(booking.id, [])
    return BookingDetail(
        **_booking_out(booking, name, flags).model_dump(),
        guest_phone=guest.get("phone"),
        guest_email=guest.get("email"),
        notes=booking.notes,
        resource_name=await resources.name(db, booking.resource_id),
    )


async def _bookable(
    db: AsyncSession, business_id: uuid.UUID, staff_id: uuid.UUID, service_id: uuid.UUID
) -> tuple[StaffProfile, Service]:
    """An active staff member of this business and an active service assigned to them."""
    staff = await db.scalar(
        select(StaffProfile).where(
            StaffProfile.id == staff_id,
            StaffProfile.business_id == business_id,
            StaffProfile.active.is_(True),
        )
    )
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Team member not found.")
    service = await db.scalar(
        select(Service)
        .join(StaffService, StaffService.service_id == Service.id)
        .where(
            Service.id == service_id,
            Service.business_id == business_id,
            Service.active.is_(True),
            StaffService.staff_id == staff.id,
        )
    )
    if service is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="That service isn't offered by this person."
        )
    return staff, service


async def _fits(
    db: AsyncSession, staff: StaffProfile, start: datetime, minutes: int
) -> tuple[datetime, datetime]:
    """The booking's UTC range, if it sits inside that day's shift and outside blocked time."""
    zone = await _zone(db, staff)
    starts_at = _local(start, zone)
    ends_at = starts_at + timedelta(minutes=minutes)
    local_end = ends_at.astimezone(ZoneInfo(zone)).replace(tzinfo=None)
    day = start.date()
    shift = await db.scalar(
        select(WeeklyShift).where(
            WeeklyShift.staff_id == staff.id,
            WeeklyShift.week_start == day - timedelta(days=day.weekday()),
            WeeklyShift.day == day.weekday(),
        )
    )
    if (
        shift is None
        or local_end.date() != day
        or start.time() < shift.starts
        or local_end.time() > shift.ends
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"That's outside {staff.display_name}'s shift. Change the shift first.",
        )
    blocked = await db.scalar(
        select(TimeOff.id).where(
            TimeOff.staff_id == staff.id, TimeOff.starts_at < ends_at, TimeOff.ends_at > starts_at
        )
    )
    if blocked is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="That time is blocked.")
    return starts_at, ends_at


async def _flush_booking(db: AsyncSession) -> None:
    """The EXCLUDE constraint decides overlaps (LLD 5.1); there is no pre-check to race."""
    try:
        await db.flush()
    except IntegrityError as error:
        await db.rollback()
        if getattr(error.orig, "sqlstate", None) == "23P01":  # exclusion_violation
            room = "no_double_resource" in str(error.orig)
            raise HTTPException(
                status.HTTP_409_CONFLICT, detail=resources.NO_ROOM if room else TAKEN
            ) from None
        raise


@router.post("/businesses/{business_id}/bookings/walk-in", status_code=status.HTTP_201_CREATED)
async def add_walk_in(
    business_id: uuid.UUID, body: WalkInIn, auth: FullySignedIn, db: Db
) -> BookingDetail:
    actor = await _actor(db, auth, business_id, "Business not found.")
    if not actor.books(body.staff_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't book for this person.")
    staff, service = await _bookable(db, business_id, body.staff_id, body.service_id)
    starts_at, ends_at = await _fits(db, staff, body.start, service.duration_minutes)
    resource_id = await resources.pick(db, service.id, staff.location_id, starts_at, ends_at)
    guest = body.guest.model_dump(exclude_none=True)
    booking = Booking(
        business_id=business_id,
        location_id=staff.location_id,
        staff_id=staff.id,
        service_id=service.id,
        guest_encrypted=encrypt(json.dumps(guest), GUEST_CONTEXT),
        starts_at=starts_at,
        ends_at=ends_at,
        status=BookingStatus.confirmed,
        source=BookingSource.owner,
        resource_id=resource_id,
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
    return await _detail(db, booking)


async def _visible_booking(
    db: AsyncSession, auth: Auth, booking_id: uuid.UUID
) -> tuple[Booking, Actor]:
    """A booking the caller may see. Columns they can't see are a 404, like other businesses."""
    booking = await db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=BOOKING_NOT_FOUND)
    actor = await _actor(db, auth, booking.business_id, BOOKING_NOT_FOUND)
    if not actor.sees(booking.staff_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=BOOKING_NOT_FOUND)
    return booking, actor


def _changeable(booking: Booking, actor: Actor) -> None:
    if not actor.books(booking.staff_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't change this appointment.")
    if booking.status not in CHANGEABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This appointment can't be changed.")


@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: uuid.UUID, auth: FullySignedIn, db: Db) -> BookingDetail:
    booking, _ = await _visible_booking(db, auth, booking_id)
    detail = await _detail(db, booking)
    await db.rollback()
    return detail


@router.patch("/bookings/{booking_id}")
async def edit_booking(
    booking_id: uuid.UUID, body: BookingPatch, auth: FullySignedIn, db: Db
) -> BookingDetail:
    booking, actor = await _visible_booking(db, auth, booking_id)
    _changeable(booking, actor)
    changes = body.model_dump(exclude_none=True)
    before = (booking.staff_id, booking.starts_at)
    if body.staff_id is not None or body.service_id is not None or body.start is not None:
        staff_id = body.staff_id or booking.staff_id
        if not actor.books(staff_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't book for this person.")
        staff, service = await _bookable(
            db, booking.business_id, staff_id, body.service_id or booking.service_id
        )
        zone = await _zone(db, staff)
        start = body.start or booking.starts_at.astimezone(ZoneInfo(zone)).replace(tzinfo=None)
        starts_at, ends_at = await _fits(db, staff, start, service.duration_minutes)
        booking.resource_id = await resources.pick(
            db, service.id, staff.location_id, starts_at, ends_at, booking
        )
        booking.staff_id = staff.id
        booking.location_id = staff.location_id
        booking.starts_at, booking.ends_at = starts_at, ends_at
        if service.id != booking.service_id:
            booking.service_id = service.id
            booking.price_minor, booking.currency = service.price_minor, service.currency
    if body.notes is not None:
        booking.notes = body.notes
    moved = (booking.staff_id, booking.starts_at) != before
    audit(
        db,
        actor=auth.user.id,
        action="booking.update",
        target_type="booking",
        target_id=booking.id,
        fields=sorted(changes),
    )
    await _flush_booking(db)
    await db.commit()
    if moved:
        from app.booking import customer, waitlist

        await customer.notify(db, booking, "moved")
        await waitlist.offer(db, booking.business_id, *before)
    return await _detail(db, booking)


@router.patch("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: uuid.UUID, auth: FullySignedIn, db: Db
) -> BookingDetail | MyBooking:
    # the customer side and the waitlist import this module
    from app.booking import customer, waitlist

    if auth.user.role is Role.consumer:
        return await customer.cancel_own(db, auth, booking_id)
    booking, actor = await _visible_booking(db, auth, booking_id)
    _changeable(booking, actor)
    booking.status = BookingStatus.cancelled
    booking.cancelled_at = utcnow()
    audit(
        db, actor=auth.user.id, action="booking.cancel", target_type="booking", target_id=booking.id
    )
    await db.commit()
    await customer.notify(db, booking, "cancelled")
    await waitlist.offer(db, booking.business_id, booking.staff_id, booking.starts_at)
    return await _detail(db, booking)


# --- outcomes (HLD 4.8, LLD 4.3) ---------------------------------------------------------


async def _outcome(
    db: AsyncSession, auth: Auth, booking_id: uuid.UUID, outcome: BookingStatus
) -> BookingDetail:
    booking, actor = await _visible_booking(db, auth, booking_id)
    if not actor.marks(booking.staff_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't mark this appointment.")
    if booking.status is not BookingStatus.confirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This appointment can't be marked.")
    if booking.starts_at > utcnow():
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Mark the appointment once it has started."
        )
    booking.status = outcome
    if booking.consumer_user_id is not None:
        await _count(db, booking, outcome)
    audit(
        db,
        actor=auth.user.id,
        action="booking.no_show" if outcome is BookingStatus.no_show else "booking.complete",
        target_type="booking",
        target_id=booking.id,
    )
    await db.commit()
    return await _detail(db, booking)


async def _count(db: AsyncSession, booking: Booking, outcome: BookingStatus) -> None:
    """A no-show adds to the streak; a finished visit resets it and counts towards regular."""
    profile = await db.scalar(
        select(CustomerProfile)
        .where(
            CustomerProfile.business_id == booking.business_id,
            CustomerProfile.consumer_user_id == booking.consumer_user_id,
        )
        .with_for_update()
    )
    if profile is None:
        profile = CustomerProfile(
            business_id=booking.business_id,
            consumer_user_id=booking.consumer_user_id,
            no_show_streak=0,
            completed_count=0,
        )
        db.add(profile)
    if outcome is BookingStatus.no_show:
        profile.no_show_streak += 1
    else:
        profile.no_show_streak = 0
        profile.completed_count += 1


@router.patch("/bookings/{booking_id}/complete")
async def complete_booking(booking_id: uuid.UUID, auth: FullySignedIn, db: Db) -> BookingDetail:
    return await _outcome(db, auth, booking_id, BookingStatus.completed)


@router.patch("/bookings/{booking_id}/no-show")
async def no_show_booking(booking_id: uuid.UUID, auth: FullySignedIn, db: Db) -> BookingDetail:
    return await _outcome(db, auth, booking_id, BookingStatus.no_show)


# --- the day board ---------------------------------------------------------------------------


@router.get("/businesses/{business_id}/calendar")
async def day_board(
    business_id: uuid.UUID,
    auth: FullySignedIn,
    db: Db,
    day: Annotated[date, Query(alias="date")],
    location_id: uuid.UUID | None = None,
) -> CalendarOut:
    actor = await _actor(db, auth, business_id, "Business not found.")
    if actor.staff is not None and Flag.calendar_view not in actor.flags:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't see the calendar.")
    places = list(
        await db.scalars(
            select(Location)
            .where(Location.business_id == business_id)
            .order_by(Location.created_at)
        )
    )
    wanted = location_id or (actor.staff.location_id if actor.staff else None)
    place = next((p for p in places if p.id == wanted), None) if wanted else places[0]
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found.")
    staff = [
        s
        for s in await db.scalars(
            select(StaffProfile)
            .where(
                StaffProfile.business_id == business_id,
                StaffProfile.location_id == place.id,
                StaffProfile.active.is_(True),
            )
            .order_by(StaffProfile.created_at)
        )
        if actor.sees(s.id)
    ]
    ids = [s.id for s in staff]
    tz = ZoneInfo(place.timezone)
    start = datetime.combine(day, time(), tz).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time(), tz).astimezone(UTC)
    shifts = {
        s.staff_id: s
        for s in await db.scalars(
            select(WeeklyShift).where(
                WeeklyShift.staff_id.in_(ids),
                WeeklyShift.week_start == day - timedelta(days=day.weekday()),
                WeeklyShift.day == day.weekday(),
            )
        )
    }
    bookings = (
        await db.execute(
            select(Booking, Service.name)
            .join(Service, Service.id == Booking.service_id)
            .where(
                Booking.staff_id.in_(ids),
                Booking.status != BookingStatus.cancelled,
                Booking.starts_at < end,
                Booking.ends_at > start,
            )
            .order_by(Booking.starts_at)
        )
    ).all()
    flags = await _flags(db, [b for b, _ in bookings])
    blocks = await db.scalars(
        select(TimeOff)
        .where(TimeOff.staff_id.in_(ids), TimeOff.starts_at < end, TimeOff.ends_at > start)
        .order_by(TimeOff.starts_at)
    )
    bookable = [s.id for s in staff if actor.books(s.id)]
    offered: dict[uuid.UUID, BookableService] = {}
    for service, staff_id in await db.execute(
        select(Service, StaffService.staff_id)
        .join(StaffService, StaffService.service_id == Service.id)
        .where(StaffService.staff_id.in_(bookable), Service.active.is_(True))
        .order_by(Service.name)
    ):
        entry = offered.setdefault(
            service.id,
            BookableService(
                id=service.id,
                name=service.name,
                duration_minutes=service.duration_minutes,
                price_minor=service.price_minor,
                currency=service.currency,
                staff_ids=[],
            ),
        )
        entry.staff_ids.append(staff_id)
    return CalendarOut(
        date=day,
        location_id=place.id,
        timezone=place.timezone,
        locations=[PlaceOut(id=p.id, name=p.name) for p in places],
        staff=[
            Column(
                id=s.id,
                display_name=s.display_name,
                title=s.title,
                shift=DayShift(starts=shifts[s.id].starts, ends=shifts[s.id].ends)
                if s.id in shifts
                else None,
            )
            for s in staff
        ],
        bookings=[_booking_out(b, name, flags.get(b.id, [])) for b, name in bookings],
        time_off=[_time_off_out(b) for b in blocks],
        services=list(offered.values()),
        can_block_time=actor.is_owner,
        can_book_staff_ids=bookable,
        can_mark_staff_ids=[s.id for s in staff if actor.marks(s.id)],
    )


@router.get("/businesses/{business_id}/calendar/week")
async def week_board(
    business_id: uuid.UUID, staff_id: uuid.UUID, week: Week, auth: FullySignedIn, db: Db
) -> WeekOut:
    """One person's week: shifts, appointments and blocked time, Monday to Sunday."""
    monday = _monday(week)
    actor = await _actor(db, auth, business_id, "Business not found.")
    if actor.staff is not None and Flag.calendar_view not in actor.flags:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't see the calendar.")
    staff = await db.scalar(
        select(StaffProfile).where(
            StaffProfile.id == staff_id, StaffProfile.business_id == business_id
        )
    )
    if staff is None or not actor.sees(staff.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Team member not found.")
    zone = await _zone(db, staff)
    tz = ZoneInfo(zone)
    start = datetime.combine(monday, time(), tz).astimezone(UTC)
    end = datetime.combine(monday + timedelta(days=7), time(), tz).astimezone(UTC)
    shifts = {
        s.day: s
        for s in await db.scalars(
            select(WeeklyShift).where(
                WeeklyShift.staff_id == staff.id, WeeklyShift.week_start == monday
            )
        )
    }
    rows = (
        await db.execute(
            select(Booking, Service.name)
            .join(Service, Service.id == Booking.service_id)
            .where(
                Booking.staff_id == staff.id,
                Booking.status != BookingStatus.cancelled,
                Booking.starts_at < end,
                Booking.ends_at > start,
            )
            .order_by(Booking.starts_at)
        )
    ).all()
    flags = await _flags(db, [b for b, _ in rows])
    blocks = await db.scalars(
        select(TimeOff)
        .where(TimeOff.staff_id == staff.id, TimeOff.starts_at < end, TimeOff.ends_at > start)
        .order_by(TimeOff.starts_at)
    )
    days = []
    for offset in range(7):
        shift = shifts.get(offset)
        days.append(
            WeekDay(
                date=monday + timedelta(days=offset),
                shift=DayShift(starts=shift.starts, ends=shift.ends) if shift else None,
            )
        )
    return WeekOut(
        week=monday,
        timezone=zone,
        staff=Column(id=staff.id, display_name=staff.display_name, title=staff.title, shift=None),
        days=days,
        bookings=[_booking_out(b, name, flags.get(b.id, [])) for b, name in rows],
        time_off=[_time_off_out(b) for b in blocks],
    )


@router.get("/businesses/{business_id}/channels")
async def channels(business_id: uuid.UUID, auth: Owner, db: Db) -> list[ChannelCount]:
    """Online bookings made in the last 30 days, per place the venue shared its link (slice 10)."""
    business = await _owned(db, auth, business_id)
    count = func.count().label("bookings")
    rows = await db.execute(
        select(Booking.channel, count)
        .where(
            Booking.business_id == business.id,
            Booking.source == BookingSource.consumer,
            Booking.created_at > utcnow() - timedelta(days=30),
        )
        .group_by(Booking.channel)
        .order_by(count.desc(), Booking.channel)
    )
    return [ChannelCount.model_validate({"channel": c, "bookings": n}) for c, n in rows.all()]
