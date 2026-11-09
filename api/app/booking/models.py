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
    rebook_reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Which of the venue's own links it came through (slice 10); None when found on Spruce.
    channel: Mapped[str | None] = mapped_column(String(16))
    # The room or equipment the visit uses (slice 12); None when the service needs none.
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("resources.id", ondelete="SET NULL"), index=True
    )

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
        ExcludeConstraint(
            ("resource_id", "="),
            (text("tstzrange(starts_at, ends_at)"), "&&"),
            name="no_double_resource",
            using="gist",
            where=text("status <> 'cancelled' AND resource_id IS NOT NULL"),
        ),
    )


class CustomerProfile(IdMixin, Base):
    """What one business knows about one customer's visits there (HLD 4.8, LLD 3.5, 5.6).

    Business-local: the unique pair keeps each venue's counts apart. The flags are worked out
    from the counts, so they can never disagree with them.
    """

    __tablename__ = "customer_profiles"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    consumer_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    no_show_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # When the venue last recorded a patch test for this customer (slice 13).
    patch_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("business_id", "consumer_user_id", name="uq_customer_profiles_pair"),
    )

    @property
    def flags(self) -> list[str]:
        out = []
        if self.no_show_streak >= RISK_STREAK:
            out.append("risk")
        if self.completed_count >= REGULAR_VISITS:
            out.append("regular")
        return out


RISK_STREAK = 2  # consecutive no-shows (HLD 4.8)
REGULAR_VISITS = 2  # finished visits


class WaitlistEntry(IdMixin, CreatedMixin, Base):
    """A customer waiting for a time for one service on one local day (slice 7)."""

    __tablename__ = "waitlist_entries"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("services.id", ondelete="CASCADE"), nullable=False
    )
    consumer_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    day: Mapped[date] = mapped_column(Date, nullable=False)
    name_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("consumer_user_id", "service_id", "day", name="uq_waitlist_once"),
    )


class FormAnswers(Base):
    """A customer's consultation answers for one visit (slice 13).

    Health information: the questions as asked and the answers are one encrypted JSON blob.
    """

    __tablename__ = "form_answers"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("bookings.id", ondelete="CASCADE"), primary_key=True
    )
    answers_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
