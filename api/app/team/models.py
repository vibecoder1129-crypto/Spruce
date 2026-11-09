import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.business.models import Category
from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class Flag(enum.StrEnum):
    """The six grantable employee permissions (HLD 9). Every one defaults to off.

    permissions.manage, business.settings, chat.business and shift.manage are never grantable,
    so they are not values here: the database cannot store them and code keeps them owner-only.
    """

    calendar_view = "calendar.view"
    calendar_team = "calendar.team"
    appointments_own = "appointments.own"
    checkout_own = "checkout.own"
    reports_own = "reports.own"
    chat_personal = "chat.personal"


class Service(IdMixin, CreatedMixin, Base):
    """Archived (active = false), never deleted: bookings will point at it (slice 5)."""

    __tablename__ = "services"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[Category] = mapped_column(
        Enum(Category, name="business_category", create_type=False), nullable=False
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    price_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Weeks until clients usually come back; 0 sends no rebooking reminder (slice 9).
    rebook_weeks: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )

    __table_args__ = (
        CheckConstraint(
            "duration_minutes BETWEEN 5 AND 480 AND duration_minutes % 5 = 0",
            name="duration_in_steps",
        ),
        CheckConstraint("price_minor >= 0", name="price_not_negative"),
    )


class StaffService(Base):
    """Only staff with a row here are bookable for that service (LLD 3.2)."""

    __tablename__ = "staff_services"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE"), primary_key=True
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("services.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class PermissionGrant(IdMixin, Base):
    """One active row per (staff, flag). A re-grant after a revoke is a new row (LLD 3.1)."""

    __tablename__ = "permission_grants"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    flag_key: Mapped[Flag] = mapped_column(
        Enum(Flag, name="permission_flag", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    granted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "uq_permission_grants_active",
            "staff_id",
            "flag_key",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )


class StaffInvite(IdMixin, CreatedMixin, Base):
    __tablename__ = "staff_invites"

    staff_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email_index: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    email_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when a newer invite replaces this one.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
