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
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class Role(enum.StrEnum):
    """Account type (LLD 3.1). It is not a permission set: staff rights come from grants."""

    consumer = "consumer"
    owner = "owner"
    staff = "staff"
    admin = "admin"  # platform admin


MFA_REQUIRED_ROLES = frozenset({Role.owner, Role.admin})


class User(IdMixin, CreatedMixin, Base):
    __tablename__ = "users"

    email_index: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    email_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Customers' "time to rebook" emails (slice 9). They can turn them off in their account.
    rebook_reminders: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Europe/Riga")
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")

    mfa_secret_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Last accepted TOTP time step: stops the same code being replayed within its window.
    mfa_last_step: Mapped[int | None] = mapped_column(Integer)

    # GDPR art. 7: we can show when, and to which version, the person agreed.
    terms_version: Mapped[str] = mapped_column(String(16), nullable=False)
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    failed_logins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL", name="mfa_has_secret"
        ),
    )


class Session(IdMixin, CreatedMixin, Base):
    """A signed-in device. Checked on every request, so revoking it takes effect immediately."""

    __tablename__ = "sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("staff_profiles.id", ondelete="CASCADE")
    )
    access_token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    refresh_token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    # The refresh token this one replaced. Presenting it again means it was stolen.
    previous_refresh_hash: Mapped[bytes | None] = mapped_column(LargeBinary(32), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    mfa_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set while a platform admin helps as this owner (slice 8). Every change it makes is audited.
    support_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE")
    )

    __table_args__ = (
        Index("ix_sessions_user_active", "user_id", "revoked_at"),
        Index("ix_sessions_staff_active", "staff_id", "revoked_at"),
    )


class TokenPurpose(enum.StrEnum):
    verify_email = "verify_email"
    reset_password = "reset_password"  # noqa: S105 (an enum label, not a secret)


class OneTimeToken(IdMixin, CreatedMixin, Base):
    __tablename__ = "one_time_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    purpose: Mapped[TokenPurpose] = mapped_column(
        Enum(TokenPurpose, name="token_purpose"), nullable=False
    )
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecoveryCode(IdMixin, CreatedMixin, Base):
    """Single-use MFA backup codes, stored hashed."""

    __tablename__ = "mfa_recovery_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
