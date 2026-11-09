import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class Category(enum.StrEnum):
    hair = "hair"
    barber = "barber"
    nails = "nails"
    brows_lashes = "brows_lashes"
    makeup = "makeup"
    skin = "skin"
    massage = "massage"
    spa = "spa"
    wellness = "wellness"


class ApprovalStatus(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class RejectReason(enum.StrEnum):
    """HLD 6: the admin's reason list."""

    invalid_documents = "invalid_documents"
    incomplete_profile = "incomplete_profile"
    duplicate_listing = "duplicate_listing"
    category_not_supported = "category_not_supported"
    suspicious_info = "suspicious_info"
    out_of_launch_area = "out_of_launch_area"
    policy_violation = "policy_violation"
    other = "other"


class Business(IdMixin, CreatedMixin, Base):
    __tablename__ = "businesses"

    # One business per owner in v1 (slice 2 decision).
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[Category] = mapped_column(Enum(Category, name="business_category"))
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status"),
        nullable=False,
        default=ApprovalStatus.pending,
    )
    rejection_reason: Mapped[RejectReason | None] = mapped_column(
        Enum(RejectReason, name="reject_reason")
    )
    rejection_note: Mapped[str | None] = mapped_column(Text)
    # Set when the owner finishes onboarding; only submitted businesses reach the review queue.
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # How close to the start a customer can still cancel or move. 0 means until it starts.
    cancel_window_hours: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    # Support access (slice 8): while in the future, a platform admin may help as the owner.
    support_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "(approval_status = 'rejected') = (rejection_reason IS NOT NULL)",
            name="rejection_has_reason",
        ),
        CheckConstraint(
            "cancel_window_hours IN (0, 2, 6, 12, 24, 48)", name="cancel_window_choices"
        ),
        Index("ix_businesses_review_queue", "approval_status", "submitted_at"),
    )


class Location(IdMixin, CreatedMixin, Base):
    """A venue. Latitude and longitude come from the server-side geocoder only.

    The migration adds a generated `geog geography(Point, 4326)` column with a GiST index for
    radius search; it is not mapped here because nothing writes it.
    """

    __tablename__ = "locations"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    street: Mapped[str] = mapped_column(String(160), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(16), nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    address_text: Mapped[str] = mapped_column(String(300), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
    )


class StaffProfile(IdMixin, CreatedMixin, Base):
    """A professional at one location (LLD 3.1). user_id is set when they accept an invite."""

    __tablename__ = "staff_profiles"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), unique=True
    )
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    # Removing a staff member archives them, so their history stays.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # The share of each service amount they earn, kept on each sale at checkout (slice 14).
    commission_percent: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
