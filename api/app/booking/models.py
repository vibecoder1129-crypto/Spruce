import enum
import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class BookingStatus(enum.StrEnum):
    pending = "pending"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class BookingSource(enum.StrEnum):
    consumer = "consumer"
    owner = "owner"


class WeeklyShift(IdMixin, Base):
    """One staff member's hours on one day of one dated week (LLD 3.3). Not a recurring rule.

    Times are wall-clock times at the staff member's location.
    """

    __tablename__ = "weekly_shifts"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    starts: Mapped[time] = mapped_column(Time, nullable=False)
    ends: Mapped[time] = mapped_column(Time, nullable=False)

    __table_args__ = (
        UniqueConstraint("staff_id", "week_start", "day", name="uq_weekly_shifts_staff_day"),
        CheckConstraint("extract(isodow from week_start) = 1", name="week_starts_monday"),
        CheckConstraint("day BETWEEN 0 AND 6", name="day_of_week"),
        CheckConstraint("ends > starts", name="ends_after_starts"),
    )


class TimeOff(IdMixin, CreatedMixin, Base):
    """Time off or blocked time, independent of shifts (LLD 3.3)."""

    __tablename__ = "time_off"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(60), nullable=False, default="")

    __table_args__ = (CheckConstraint("ends_at > starts_at", name="ends_after_starts"),)


class Booking(IdMixin, CreatedMixin, Base):
    """An appointment. The EXCLUDE constraint, not app code, prevents double bookings (LLD 5.1)."""

    __tablename__ = "bookings"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="RESTRICT"), nullable=False
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("services.id", ondelete="RESTRICT"), nullable=False
    )
    # Null for a guest. Consumer bookings arrive in slice 5.
    consumer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    # Guest name, phone and email as one encrypted JSON blob.
    guest_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status"), nullable=False
    )
    source: Mapped[BookingSource] = mapped_column(
        Enum(BookingSource, name="booking_source"), nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Copied from the service when booked, so a later price change doesn't rewrite it.
    price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ends_after_starts"),
        CheckConstraint(
            "consumer_user_id IS NOT NULL OR guest_encrypted IS NOT NULL", name="has_a_client"
        ),
        Index("ix_bookings_location_starts", "location_id", "starts_at"),
        ExcludeConstraint(
            ("staff_id", "="),
            (text("tstzrange(starts_at, ends_at)"), "&&"),
            name="no_double_booking",
            using="gist",
            where=text("status <> 'cancelled'"),
        ),
    )
