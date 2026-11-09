import uuid
from datetime import datetime

from pydantic import BaseModel

from app.booking.schemas import ClockTime
from app.business.models import Category


class SearchResult(BaseModel):
    business_id: uuid.UUID
    business_name: str
    category: Category
    location_id: uuid.UUID
    location_name: str
    city: str
    country_code: str
    address_text: str
    latitude: float
    longitude: float
    # Null when the search has no point to measure from.
    distance_km: float | None
    from_price_minor: int
    currency: str


class SearchOut(BaseModel):
    results: list[SearchResult]
    page: int
    has_more: bool


class CityOut(BaseModel):
    country_code: str
    city: str
    count: int


class DayHours(BaseModel):
    day: int
    opens: ClockTime | None
    closes: ClockTime | None


class StoreLocation(BaseModel):
    id: uuid.UUID
    name: str
    address_text: str
    latitude: float
    longitude: float
    timezone: str
    hours: list[DayHours]


class StoreService(BaseModel):
    id: uuid.UUID
    name: str
    category: Category
    duration_minutes: int
    price_minor: int
    currency: str
    staff_ids: list[uuid.UUID]  # who does it, in team order


class StoreMember(BaseModel):
    """Public: display name and title only."""

    id: uuid.UUID
    display_name: str
    title: str


class StorefrontOut(BaseModel):
    id: uuid.UUID
    name: str
    category: Category
    locations: list[StoreLocation]
    services: list[StoreService]
    team: list[StoreMember]
    cancel_window_hours: int


class FavoriteOut(BaseModel):
    business_id: uuid.UUID
    business_name: str
    category: Category
    city: str
    saved_at: datetime
