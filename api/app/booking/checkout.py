"""Checkout, commissions and tips (slice 14). Spruce records what was paid at the venue."""

import uuid
from datetime import date, datetime, time, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.booking.models import BookingStatus, Sale
from app.booking.router import _count, _detail, _visible_booking
from app.booking.schemas import BookingDetail, CheckoutIn, TakingsOut, TakingsRow, TakingsTotals
from app.business.models import Business, Location, StaffProfile
from app.business.router import Owner, _owned
from app.geo import currency_for
from app.identity.deps import Db, FullySignedIn
from app.models_base import utcnow
from app.team.models import Flag, PermissionGrant
from app.team.router import StaffUser, _me

router = APIRouter(tags=["checkout"])

MAX_DAYS = 92
From = Annotated[date, Query(alias="from")]
To = Annotated[date, Query(alias="to")]


@router.post("/bookings/{booking_id}/checkout")
async def checkout(
    booking_id: uuid.UUID, body: CheckoutIn, auth: FullySignedIn, db: Db
) -> BookingDetail:
    booking, actor = await _visible_booking(db, auth, booking_id)
    if not actor.marks(booking.staff_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't check out this visit.")
    if booking.status is not BookingStatus.confirmed:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This visit can't be checked out.")
    if booking.starts_at > utcnow():
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Check out once the visit has started."
        )
    staff = await db.get_one(StaffProfile, booking.staff_id)
    db.add(
        Sale(
            business_id=booking.business_id,
            booking_id=booking.id,
            staff_id=staff.id,
            price_minor=body.price_minor,
            tip_minor=body.tip_minor,
            method=body.method,
            currency=booking.currency,
            # Half a cent rounds up. Tips go to the person in full.
            commission_minor=(body.price_minor * staff.commission_percent + 50) // 100,
            created_by_user_id=auth.user.id,
        )
    )
    booking.status = BookingStatus.completed
    if booking.consumer_user_id is not None:
        await _count(db, booking, BookingStatus.completed)
    audit(
        db,
        actor=auth.user.id,
        action="booking.checkout",
        target_type="booking",
        target_id=booking.id,
    )
    await db.commit()
    return await _detail(db, booking)


async def _takings(
    db: AsyncSession,
    business: Business,
    start: date,
    end: date,
    staff_id: uuid.UUID | None = None,
) -> TakingsOut:
    if end < start or (end - start).days >= MAX_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Pick an end date on or after the start, at most {MAX_DAYS} days in.",
        )
    place = (
        await db.execute(
            select(Location.timezone, Location.country_code)
            .where(Location.business_id == business.id)
            .order_by(Location.created_at)
            .limit(1)
        )
    ).one()
    zone = ZoneInfo(place[0])
    since = datetime.combine(start, time.min, zone)
    until = datetime.combine(end + timedelta(days=1), time.min, zone)
    query = (
        select(
            Sale.staff_id,
            StaffProfile.display_name,
            func.count(),
            func.sum(Sale.price_minor),
            func.sum(Sale.tip_minor),
            func.sum(Sale.commission_minor),
        )
        .join(StaffProfile, StaffProfile.id == Sale.staff_id)
        .where(Sale.business_id == business.id, Sale.created_at >= since, Sale.created_at < until)
        .group_by(Sale.staff_id, StaffProfile.display_name)
        .order_by(StaffProfile.display_name)
    )
    if staff_id is not None:
        query = query.where(Sale.staff_id == staff_id)
    rows = [
        TakingsRow(
            staff_id=r[0],
            display_name=r[1],
            visits=r[2],
            sales_minor=r[3],
            tips_minor=r[4],
            commission_minor=r[5],
        )
        for r in await db.execute(query)
    ]
    totals = TakingsTotals(
        visits=sum(r.visits for r in rows),
        sales_minor=sum(r.sales_minor for r in rows),
        tips_minor=sum(r.tips_minor for r in rows),
        commission_minor=sum(r.commission_minor for r in rows),
    )
    return TakingsOut(currency=currency_for(place[1]), rows=rows, totals=totals)


@router.get("/businesses/{business_id}/takings")
async def takings(business_id: uuid.UUID, start: From, end: To, auth: Owner, db: Db) -> TakingsOut:
    business = await _owned(db, auth, business_id)
    return await _takings(db, business, start, end)


@router.get("/me/takings")
async def my_takings(start: From, end: To, auth: StaffUser, db: Db) -> TakingsOut:
    staff = await _me(db, auth)
    allowed = await db.scalar(
        select(PermissionGrant.id).where(
            PermissionGrant.staff_id == staff.id,
            PermissionGrant.flag_key == Flag.reports_own,
            PermissionGrant.revoked_at.is_(None),
        )
    )
    if allowed is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't see reports.")
    business = await db.get_one(Business, staff.business_id)
    return await _takings(db, business, start, end, staff.id)
