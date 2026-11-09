import uuid
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.business.models import ApprovalStatus, Category, RejectReason
from app.geo import COUNTRIES

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)]


class Strict(BaseModel):
    # Unknown fields are an error, so a client can't slip in status, owner or coordinates.
    model_config = ConfigDict(extra="forbid")


class BusinessIn(Strict):
    name: Name
    category: Category


CancelWindow = Literal[0, 2, 6, 12, 24, 48]


class BusinessPatch(Strict):
    name: Name | None = None
    category: Category | None = None
    cancel_window_hours: CancelWindow | None = None


class BusinessOut(BaseModel):
    id: uuid.UUID
    name: str
    category: Category
    approval_status: ApprovalStatus
    rejection_reason: RejectReason | None
    rejection_note: str | None
    submitted_at: datetime | None
    cancel_window_hours: int


class LocationIn(Strict):
    name: Short
    street: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    postal_code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)
    ]
    city: Short
    country_code: Annotated[str, StringConstraints(to_upper=True, pattern=r"^[A-Za-z]{2}$")]
    timezone: str

    @model_validator(mode="after")
    def known_country_and_zone(self) -> Self:
        country = COUNTRIES.get(self.country_code)
        if country is None:
            raise ValueError("Spruce isn't available in that country yet.")
        if self.timezone not in country[1]:
            raise ValueError("That time zone doesn't belong to the country.")
        return self


class LocationOut(BaseModel):
    id: uuid.UUID
    name: str
    address_text: str
    latitude: float
    longitude: float
    timezone: str


class StaffIn(Strict):
    display_name: Short
    title: Title = ""
    location_id: uuid.UUID


class StaffOut(BaseModel):
    id: uuid.UUID
    display_name: str
    title: str
    location_id: uuid.UUID
    has_login: bool
    active: bool = True
    service_ids: list[uuid.UUID] = []


class CountryOut(BaseModel):
    code: str
    name: str
    timezones: list[str]


class RejectIn(Strict):
    reason: RejectReason
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None

    @model_validator(mode="after")
    def other_needs_a_note(self) -> Self:
        if self.reason is RejectReason.other and not self.note:
            raise ValueError("Add a note when the reason is Other.")
        return self


class AdminBusinessOut(BusinessOut):
    location_count: int
    staff_count: int


class AdminBusinessDetail(BusinessOut):
    locations: list[LocationOut]
    staff: list[StaffOut]
