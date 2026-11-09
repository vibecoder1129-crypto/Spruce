"""Public marketplace: search, cities, storefronts and favourites (LLD 4.2; HLD 4.1-4.2)."""

import uuid
from datetime import datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import exists, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.booking.models import WeeklyShift
from app.business.models import ApprovalStatus, Business, Category, Location, StaffProfile
from app.business.router import _role
from app.identity.deps import Auth, Db, client_ip
from app.identity.models import Role
from app.marketplace.models import Favorite
from app.marketplace.schemas import (
    CityOut,
    DayHours,
    FavoriteOut,
    SearchOut,
    SearchResult,
    StorefrontOut,
    StoreLocation,
    StoreMember,
    StoreService,
)
from app.ratelimit import hit
from app.team.models import Service, StaffService

router = APIRouter(tags=["marketplace"])

PAGE_SIZE = 20
# Feature list 2: a fixed dropdown, not a free number.
RADII = (10, 25, 50, 60)
NOT_FOUND = "This venue isn't on Spruce."

Customer = Annotated[Auth, Depends(_role(Role.consumer))]

# A venue is public when it is approved and has something to book. Shared by every query here.
LISTED = """
    b.approval_status = 'approved'
    AND EXISTS (SELECT 1 FROM services s WHERE s.business_id = b.id AND s.active)
"""


def _listed() -> Any:
    return (Business.approval_status == ApprovalStatus.approved) & exists().where(
        Service.business_id == Business.id, Service.active.is_(True)
    )


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/marketplace/search")
async def search(
    request: Request,
    db: Db,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius_km: int = 25,
    city: Annotated[str | None, Query(max_length=80)] = None,
    country: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2}$")] = None,
    category: Category | None = None,
    q: Annotated[str | None, Query(max_length=60)] = None,
    page: Annotated[int, Query(ge=0, le=50)] = 0,
) -> SearchOut:
    await hit("search", client_ip(request), limit=120, window_seconds=60)
    if radius_km not in RADII:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Pick 10, 25, 50 or 60 km."
        )
    if (lat is None) != (lng is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Send lat and lng together."
        )
    params: dict[str, Any] = {"limit": PAGE_SIZE + 1, "offset": page * PAGE_SIZE}
    where = [LISTED]
    distance = "NULL::float"
    order = "b.name, l.name"
    if lat is not None and lng is not None:
        # PostGIS on the geography column and its GiST index (LLD 7), in metres.
        point = "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography"
        params |= {"lat": lat, "lng": lng, "radius": radius_km * 1000}
        where.append(f"ST_DWithin(l.geog, {point}, :radius)")
        distance = f"ST_Distance(l.geog, {point})"
        order = "distance_m, b.name"
    if city:
        where.append("lower(l.city) = lower(:city)")
        params["city"] = city.strip()
    if country:
        where.append("l.country_code = upper(:country)")
        params["country"] = country
    if category:
        where.append("b.category::text = :category")
        params["category"] = category.value
    if q and q.strip():
        where.append(
            "(b.name ILIKE :q OR EXISTS (SELECT 1 FROM services s WHERE s.business_id = b.id "
            "AND s.active AND s.name ILIKE :q))"
        )
        params["q"] = _like(q.strip())
    rows = (
        await db.execute(
            # Only fixed fragments are joined in; every value the visitor sends is a bound param.
            text(f"""
            SELECT b.id AS business_id, b.name AS business_name, b.category::text AS category,
                   l.id AS location_id, l.name AS location_name, l.city, l.country_code,
                   l.address_text, l.latitude, l.longitude, {distance} AS distance_m,
                   cheapest.price_minor AS from_price_minor, cheapest.currency
            FROM locations l
            JOIN businesses b ON b.id = l.business_id
            CROSS JOIN LATERAL (
                SELECT s.price_minor, s.currency FROM services s
                WHERE s.business_id = b.id AND s.active
                ORDER BY s.price_minor LIMIT 1
            ) cheapest
            WHERE {" AND ".join(where)}
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
            """),  # noqa: S608
            params,
        )
    ).mappings()
    results = [
        SearchResult(
            **{k: v for k, v in r.items() if k != "distance_m"},
            distance_km=None if r["distance_m"] is None else round(r["distance_m"] / 1000, 1),
        )
        for r in rows
    ]
    return SearchOut(results=results[:PAGE_SIZE], page=page, has_more=len(results) > PAGE_SIZE)


@router.get("/marketplace/cities")
async def cities(db: Db) -> list[CityOut]:
    rows = await db.execute(
        text(f"""
        SELECT l.country_code, l.city, count(DISTINCT b.id) AS count
        FROM locations l JOIN businesses b ON b.id = l.business_id
        WHERE {LISTED}
        GROUP BY l.country_code, l.city
        ORDER BY l.country_code, l.city
        """)  # noqa: S608
    )
    return [CityOut(**r) for r in rows.mappings()]


async def _week_hours(db: AsyncSession, place: Location) -> list[DayHours]:
    """Each day's earliest start and latest end across the location's shifts this week."""
    today = datetime.now(ZoneInfo(place.timezone)).date()
    rows = await db.execute(
        select(WeeklyShift.day, func.min(WeeklyShift.starts), func.max(WeeklyShift.ends))
        .join(StaffProfile, StaffProfile.id == WeeklyShift.staff_id)
        .where(
            StaffProfile.location_id == place.id,
            StaffProfile.active.is_(True),
            WeeklyShift.week_start == today - timedelta(days=today.weekday()),
        )
        .group_by(WeeklyShift.day)
    )
    found = {day: (opens, closes) for day, opens, closes in rows}
    return [
        DayHours(day=d, opens=found[d][0], closes=found[d][1])
        if d in found
        else DayHours(day=d, opens=None, closes=None)
        for d in range(7)
    ]


@router.get("/marketplace/businesses/{business_id}")
async def storefront(business_id: uuid.UUID, db: Db) -> StorefrontOut:
    business = await db.scalar(select(Business).where(Business.id == business_id, _listed()))
    if business is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    places = await db.scalars(
        select(Location).where(Location.business_id == business.id).order_by(Location.created_at)
    )
    services = await db.scalars(
        select(Service)
        .where(Service.business_id == business.id, Service.active.is_(True))
        .order_by(Service.category, Service.name)
    )
    team = list(
        await db.scalars(
            select(StaffProfile)
            .where(StaffProfile.business_id == business.id, StaffProfile.active.is_(True))
            .order_by(StaffProfile.created_at)
        )
    )
    who: dict[uuid.UUID, list[uuid.UUID]] = {}
    for service_id, staff_id in await db.execute(
        select(StaffService.service_id, StaffService.staff_id).where(
            StaffService.staff_id.in_([m.id for m in team])
        )
    ):
        who.setdefault(service_id, []).append(staff_id)
    order = {m.id: i for i, m in enumerate(team)}
    return StorefrontOut(
        id=business.id,
        name=business.name,
        category=business.category,
        locations=[
            StoreLocation(
                id=p.id,
                name=p.name,
                address_text=p.address_text,
                latitude=p.latitude,
                longitude=p.longitude,
                timezone=p.timezone,
                hours=await _week_hours(db, p),
            )
            for p in places
        ],
        services=[
            StoreService(
                id=s.id,
                name=s.name,
                category=s.category,
                duration_minutes=s.duration_minutes,
                price_minor=s.price_minor,
                currency=s.currency,
                staff_ids=sorted(who.get(s.id, []), key=order.__getitem__),
                needs_patch_test=s.needs_patch_test,
            )
            for s in services
        ],
        team=[StoreMember(id=m.id, display_name=m.display_name, title=m.title) for m in team],
        cancel_window_hours=business.cancel_window_hours,
    )


# --- favourites ------------------------------------------------------------------------------


@router.get("/me/favorites")
async def my_favorites(auth: Customer, db: Db) -> list[FavoriteOut]:
    city = (
        select(Location.city)
        .where(Location.business_id == Business.id)
        .order_by(Location.created_at)
        .limit(1)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(Business.id, Business.name, Business.category, city, Favorite.created_at)
        .join(Favorite, Favorite.business_id == Business.id)
        .where(Favorite.user_id == auth.user.id, _listed())
        .order_by(Favorite.created_at.desc())
    )
    return [
        FavoriteOut(business_id=i, business_name=n, category=c, city=ci, saved_at=t)
        for i, n, c, ci, t in rows
    ]


@router.put("/me/favorites/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def save_favorite(business_id: uuid.UUID, auth: Customer, db: Db) -> Response:
    if await db.scalar(select(Business.id).where(Business.id == business_id, _listed())) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    await db.execute(
        insert(Favorite)
        .values(user_id=auth.user.id, business_id=business_id)
        .on_conflict_do_nothing()
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/favorites/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(business_id: uuid.UUID, auth: Customer, db: Db) -> Response:
    favorite = await db.get(Favorite, (auth.user.id, business_id))
    if favorite is not None:
        await db.delete(favorite)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
