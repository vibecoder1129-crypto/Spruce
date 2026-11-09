import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field

from app.business.models import Category
from app.business.schemas import Short, Strict, Title
from app.identity.schemas import Password
from app.team.models import Flag

Minutes = Annotated[int, Field(ge=5, le=480, multiple_of=5, strict=True)]
Price = Annotated[int, Field(ge=0, le=10_000_000, strict=True)]


RebookWeeks = Literal[0, 2, 3, 4, 6, 8, 12, 26]


class ServiceIn(Strict):
    name: Short
    category: Category
    duration_minutes: Minutes
    price_minor: Price
    rebook_weeks: RebookWeeks = 0


class ServicePatch(Strict):
    name: Short | None = None
    category: Category | None = None
    duration_minutes: Minutes | None = None
    price_minor: Price | None = None
    active: bool | None = None
    rebook_weeks: RebookWeeks | None = None


class ServiceOut(BaseModel):
    id: uuid.UUID
    name: str
    category: Category
    duration_minutes: int
    price_minor: int
    currency: str
    active: bool
    rebook_weeks: int


class StaffPatch(Strict):
    display_name: Short | None = None
    title: Title | None = None
    location_id: uuid.UUID | None = None
    active: bool | None = None


class StaffServicesIn(Strict):
    service_ids: Annotated[list[uuid.UUID], Field(max_length=200)]


class StaffServicesOut(BaseModel):
    service_ids: list[uuid.UUID]


class PermissionOut(BaseModel):
    flag: Flag
    granted: bool


class GrantIn(Strict):
    granted: bool


class InviteIn(Strict):
    email: EmailStr = Field(max_length=254)


class InvitePreview(BaseModel):
    business_name: str
    display_name: str


class AcceptIn(Strict):
    password: str = Password
    accept_terms: Literal[True]


class MyStaffPatch(Strict):
    display_name: Short | None = None
    title: Title | None = None


class MyStaffOut(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    display_name: str
    title: str
    business_name: str
    location_name: str
    services: list[str]
    permissions: list[Flag]


class ResourceIn(Strict):
    name: Short
    location_id: uuid.UUID


class ResourcePatch(Strict):
    name: Short | None = None
    service_ids: Annotated[list[uuid.UUID], Field(max_length=500)] | None = None


class ResourceOut(BaseModel):
    id: uuid.UUID
    location_id: uuid.UUID
    name: str
    service_ids: list[uuid.UUID]
