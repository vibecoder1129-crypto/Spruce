import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.business.models import ApprovalStatus, Business, Location, StaffProfile
from app.business.schemas import (
    AdminBusinessDetail,
    AdminBusinessOut,
    BusinessIn,
    BusinessOut,
    BusinessPatch,
    CountryOut,
    LocationIn,
    LocationOut,
    RejectIn,
    StaffIn,
    StaffOut,
)
from app.geo import COUNTRIES, geocode
from app.identity.deps import Auth, Db, FullySignedIn
from app.identity.models import Role
from app.models_base import utcnow
from app.ratelimit import hit

router = APIRouter(tags=["business"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

NOT_FOUND = "Business not found."


def _role(role: Role):  # type: ignore[no-untyped-def]
    async def check(auth: FullySignedIn) -> Auth:
        if auth.user.role is not role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't do that.")
        return auth

    return check


Owner = Annotated[Auth, Depends(_role(Role.owner))]
Admin = Annotated[Auth, Depends(_role(Role.admin))]


async def _owned(db: AsyncSession, auth: Auth, business_id: uuid.UUID) -> Business:
    """The caller's own business. Anyone else's is a 404, so ids can't be probed."""
    business = await db.scalar(
        select(Business)
        .where(Business.id == business_id, Business.owner_user_id == auth.user.id)
        .with_for_update()
    )
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return business


def _out(business: Business) -> BusinessOut:
    return BusinessOut.model_validate(business, from_attributes=True)


@router.get("/geo/countries")
async def countries() -> list[CountryOut]:
    return [
        CountryOut(code=code, name=name, timezones=list(zones))
        for code, (name, zones) in sorted(COUNTRIES.items(), key=lambda c: c[1][0])
    ]


@router.post("/businesses", status_code=status.HTTP_201_CREATED)
async def create_business(body: BusinessIn, auth: Owner, db: Db) -> BusinessOut:
    if await db.scalar(select(Business.id).where(Business.owner_user_id == auth.user.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="You already have a business.")
    business = Business(owner_user_id=auth.user.id, name=body.name, category=body.category)
    db.add(business)
    await db.flush()
    audit(
        db,
        actor=auth.user.id,
        action="business.create",
        target_type="business",
        target_id=business.id,
    )
    await db.commit()
    return _out(business)


@router.get("/businesses/mine")
async def my_business(auth: Owner, db: Db) -> BusinessOut:
    business = await db.scalar(select(Business).where(Business.owner_user_id == auth.user.id))
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return _out(business)


@router.patch("/businesses/{business_id}")
async def update_business(
    business_id: uuid.UUID, body: BusinessPatch, auth: Owner, db: Db
) -> BusinessOut:
    business = await _owned(db, auth, business_id)
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(business, field, value)
    audit(
        db,
        actor=auth.user.id,
        action="business.update",
        target_type="business",
        target_id=business.id,
        fields=sorted(changes),
    )
    await db.commit()
    return _out(business)


@router.post("/businesses/{business_id}/locations", status_code=status.HTTP_201_CREATED)
async def add_location(
    business_id: uuid.UUID, body: LocationIn, auth: Owner, db: Db
) -> LocationOut:
    business = await _owned(db, auth, business_id)
    await hit("location-create", str(auth.user.id), limit=20, window_seconds=3600)
    point = await geocode(body.street, body.postal_code, body.city, body.country_code)
    country = COUNTRIES[body.country_code][0]
    location = Location(
        business_id=business.id,
        name=body.name,
        street=body.street,
        postal_code=body.postal_code,
        city=body.city,
        country_code=body.country_code,
        address_text=f"{body.street}, {body.postal_code} {body.city}, {country}",
        latitude=point.latitude,
        longitude=point.longitude,
        timezone=body.timezone,
    )
    db.add(location)
    await db.flush()
    audit(
        db,
        actor=auth.user.id,
        action="location.create",
        target_type="location",
        target_id=location.id,
        business_id=str(business.id),
    )
    await db.commit()
    return LocationOut.model_validate(location, from_attributes=True)


@router.get("/businesses/{business_id}/locations")
async def list_locations(business_id: uuid.UUID, auth: Owner, db: Db) -> list[LocationOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(
        select(Location).where(Location.business_id == business.id).order_by(Location.created_at)
    )
    return [LocationOut.model_validate(r, from_attributes=True) for r in rows]


def _staff_out(staff: StaffProfile) -> StaffOut:
    return StaffOut(
        id=staff.id,
        display_name=staff.display_name,
        title=staff.title,
        location_id=staff.location_id,
        has_login=staff.user_id is not None,
    )


@router.post("/businesses/{business_id}/staff", status_code=status.HTTP_201_CREATED)
async def add_staff(business_id: uuid.UUID, body: StaffIn, auth: Owner, db: Db) -> StaffOut:
    business = await _owned(db, auth, business_id)
    location = await db.scalar(
        select(Location.id).where(
            Location.id == body.location_id, Location.business_id == business.id
        )
    )
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found.")
    staff = StaffProfile(
        business_id=business.id,
        location_id=body.location_id,
        display_name=body.display_name,
        title=body.title,
    )
    db.add(staff)
    await db.flush()
    audit(
        db,
        actor=auth.user.id,
        action="staff.create",
        target_type="staff",
        target_id=staff.id,
        business_id=str(business.id),
    )
    await db.commit()
    return _staff_out(staff)


@router.get("/businesses/{business_id}/staff")
async def list_staff(business_id: uuid.UUID, auth: Owner, db: Db) -> list[StaffOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(
        select(StaffProfile)
        .where(StaffProfile.business_id == business.id)
        .order_by(StaffProfile.created_at)
    )
    return [_staff_out(r) for r in rows]


async def _counts(db: AsyncSession, business_id: uuid.UUID) -> tuple[int, int]:
    locations = await db.scalar(
        select(func.count()).select_from(Location).where(Location.business_id == business_id)
    )
    staff = await db.scalar(
        select(func.count())
        .select_from(StaffProfile)
        .where(StaffProfile.business_id == business_id)
    )
    return locations or 0, staff or 0


@router.post("/businesses/{business_id}/submit")
async def submit(business_id: uuid.UUID, auth: Owner, db: Db) -> BusinessOut:
    business = await _owned(db, auth, business_id)
    if business.approval_status not in (ApprovalStatus.pending, ApprovalStatus.rejected):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This business is already reviewed.")
    locations, staff = await _counts(db, business.id)
    if not locations or not staff:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Add a location and a team member first."
        )
    business.approval_status = ApprovalStatus.pending
    business.rejection_reason = None
    business.rejection_note = None
    business.submitted_at = utcnow()
    audit(
        db,
        actor=auth.user.id,
        action="business.submit",
        target_type="business",
        target_id=business.id,
    )
    await db.commit()
    return _out(business)


# --- platform admin (HLD 6) ------------------------------------------------------------------


async def _reviewable(db: AsyncSession, business_id: uuid.UUID) -> Business:
    business = await db.scalar(select(Business).where(Business.id == business_id).with_for_update())
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    if business.approval_status is not ApprovalStatus.pending or business.submitted_at is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="This business isn't waiting for review."
        )
    return business


@admin_router.get("/businesses")
async def review_queue(
    auth: Admin,
    db: Db,
    approval_status: Annotated[ApprovalStatus, Query(alias="status")] = ApprovalStatus.pending,
) -> list[AdminBusinessOut]:
    rows = await db.scalars(
        select(Business)
        .where(Business.approval_status == approval_status, Business.submitted_at.is_not(None))
        .order_by(Business.submitted_at)
        .limit(200)
    )
    out = []
    for business in rows:
        locations, staff = await _counts(db, business.id)
        out.append(
            AdminBusinessOut(
                **_out(business).model_dump(), location_count=locations, staff_count=staff
            )
        )
    return out


@admin_router.get("/businesses/{business_id}")
async def review_detail(business_id: uuid.UUID, auth: Admin, db: Db) -> AdminBusinessDetail:
    business = await db.get(Business, business_id)
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    places = await db.scalars(
        select(Location).where(Location.business_id == business.id).order_by(Location.created_at)
    )
    staff = await db.scalars(
        select(StaffProfile)
        .where(StaffProfile.business_id == business.id)
        .order_by(StaffProfile.created_at)
    )
    return AdminBusinessDetail(
        **_out(business).model_dump(),
        locations=[LocationOut.model_validate(p, from_attributes=True) for p in places],
        staff=[_staff_out(s) for s in staff],
    )


@admin_router.patch("/businesses/{business_id}/approve")
async def approve(business_id: uuid.UUID, auth: Admin, db: Db) -> BusinessOut:
    business = await _reviewable(db, business_id)
    business.approval_status = ApprovalStatus.approved
    audit(
        db,
        actor=auth.user.id,
        action="business.approve",
        target_type="business",
        target_id=business.id,
    )
    await db.commit()
    return _out(business)


@admin_router.patch("/businesses/{business_id}/reject")
async def reject(business_id: uuid.UUID, body: RejectIn, auth: Admin, db: Db) -> BusinessOut:
    business = await _reviewable(db, business_id)
    business.approval_status = ApprovalStatus.rejected
    business.rejection_reason = body.reason
    business.rejection_note = body.note or None
    audit(
        db,
        actor=auth.user.id,
        action="business.reject",
        target_type="business",
        target_id=business.id,
        reason=body.reason.value,
    )
    await db.commit()
    return _out(business)
