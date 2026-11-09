import uuid
from datetime import date, datetime, time
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    NaiveDatetime,
    PlainSerializer,
    StringConstraints,
    model_validator,
)

from app.booking.models import BookingSource, BookingStatus
from app.business.schemas import Short, Strict


def _quarter_hour(value: time) -> time:
    if value.second or value.microsecond or value.minute % 15:
        raise ValueError("Use 15-minute steps, like 09:00 or 09:15.")
    return value


def _five_minutes(value: datetime) -> datetime:
    if value.second or value.microsecond or value.minute % 5:
        raise ValueError("Use 5-minute steps, like 10:00 or 10:05.")
    return value


# Wall-clock "HH:MM" both ways.
ClockTime = Annotated[
    time, AfterValidator(_quarter_hour), PlainSerializer(lambda t: t.strftime("%H:%M"), str)
]
# A local date and time with no offset, read in the location's time zone by the server.
LocalTime = Annotated[NaiveDatetime, AfterValidator(_five_minutes)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ShiftIn(Strict):
    staff_id: uuid.UUID
    day: Annotated[int, Field(ge=0, le=6, strict=True)]
    starts: ClockTime
    ends: ClockTime

    @model_validator(mode="after")
    def ends_after_starts(self) -> Self:
        if self.ends <= self.starts:
            raise ValueError("A shift must end after it starts.")
        return self


class ShiftsIn(Strict):
    shifts: Annotated[list[ShiftIn], Field(max_length=7 * 200)]

    @model_validator(mode="after")
    def one_per_day(self) -> Self:
        days = [(s.staff_id, s.day) for s in self.shifts]
        if len(days) != len(set(days)):
            raise ValueError("One shift per person per day. Block time for a break.")
        return self


class ShiftOut(BaseModel):
    staff_id: uuid.UUID
    day: int
    starts: ClockTime
    ends: ClockTime


class TimeOffIn(Strict):
    start: LocalTime
    end: LocalTime
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] = ""

    @model_validator(mode="after")
    def ends_after_starts(self) -> Self:
        if self.end <= self.start:
            raise ValueError("Blocked time must end after it starts.")
        return self


class TimeOffOut(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    reason: str


Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[\d ()-]{6,24}$")]


class GuestIn(Strict):
    name: Short
    phone: Phone | None = None
    email: EmailStr | None = None


class WalkInIn(Strict):
    staff_id: uuid.UUID
    service_id: uuid.UUID
    start: LocalTime
    guest: GuestIn
    notes: Notes = ""


class BookingPatch(Strict):
    staff_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    start: LocalTime | None = None
    notes: Notes | None = None


class BookingOut(BaseModel):
    id: uuid.UUID
    staff_id: uuid.UUID
    service_id: uuid.UUID
    service_name: str
    client_name: str
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    source: BookingSource
    price_minor: int
    currency: str
    client_flags: list[str]  # "risk", "regular": this venue's view of the customer


class BookingDetail(BookingOut):
    guest_phone: str | None
    guest_email: str | None
    notes: str


class DayShift(BaseModel):
    starts: ClockTime
    ends: ClockTime


class Column(BaseModel):
    id: uuid.UUID
    display_name: str
    title: str
    shift: DayShift | None


class PlaceOut(BaseModel):
    id: uuid.UUID
    name: str


class BookableService(BaseModel):
    id: uuid.UUID
    name: str
    duration_minutes: int
    price_minor: int
    currency: str
    staff_ids: list[uuid.UUID]


class CalendarOut(BaseModel):
    date: date
    location_id: uuid.UUID
    timezone: str
    locations: list[PlaceOut]
    staff: list[Column]
    bookings: list[BookingOut]
    time_off: list[TimeOffOut]
    # Active services offered by the columns the caller may book for, for the walk-in form.
    services: list[BookableService]
    # What the caller may do, so the web can hide what the API would refuse anyway.
    can_block_time: bool
    can_book_staff_ids: list[uuid.UUID]
    can_mark_staff_ids: list[uuid.UUID]  # whose started visits the caller may mark done or no-show


class WeekDay(BaseModel):
    date: date
    shift: DayShift | None


class WeekOut(BaseModel):
    """One person's week (slice 6c)."""

    week: date
    timezone: str
    staff: Column
    days: list[WeekDay]
    bookings: list[BookingOut]
    time_off: list[TimeOffOut]


# --- customer booking (slice 5b) -------------------------------------------------------------


class Slot(BaseModel):
    staff_id: uuid.UUID
    time: str  # "HH:MM" at the venue


class AvailabilityOut(BaseModel):
    date: date
    timezone: str
    slots: list[Slot]


Channel = Literal["link", "website", "instagram", "google", "facebook"]


class CustomerBookingIn(Strict):
    service_id: uuid.UUID
    staff_id: uuid.UUID
    start: LocalTime
    name: Short
    phone: Phone | None = None
    notes: Notes = ""
    channel: Channel | None = None  # only a label for the venue's own counts


class ChannelCount(BaseModel):
    channel: Channel | None
    bookings: int


class RescheduleIn(Strict):
    start: LocalTime
    staff_id: uuid.UUID | None = None


class MyBooking(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    location_name: str
    address: str
    service_id: uuid.UUID
    service_name: str
    staff_id: uuid.UUID
    staff_name: str
    start: str  # "YYYY-MM-DDTHH:MM" at the venue
    end: str
    timezone: str
    status: BookingStatus
    price_minor: int
    currency: str
    can_change: bool
    cancel_window_hours: int


class MyBookingsOut(BaseModel):
    upcoming: list[MyBooking]
    past: list[MyBooking]


class WaitlistIn(Strict):
    service_id: uuid.UUID
    date: date
    name: Short


class MyWaitlistEntry(BaseModel):
    id: uuid.UUID
    business_id: uuid.UUID
    business_name: str
    service_id: uuid.UUID
    service_name: str
    date: date
    notified: bool


class WaitingOut(BaseModel):
    id: uuid.UUID
    name: str
    service_name: str
    joined_at: datetime
    notified: bool
