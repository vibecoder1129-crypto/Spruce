"""Weekly shifts, time off and bookings with the double-booking constraint.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

STATUS = sa.Enum("pending", "confirmed", "completed", "cancelled", "no_show", name="booking_status")
SOURCE = sa.Enum("consumer", "owner", name="booking_source")


def _staff(ondelete: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "staff_id",
        sa.Uuid(),
        sa.ForeignKey("staff_profiles.id", ondelete=ondelete),
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "weekly_shifts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _staff("CASCADE"),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("day", sa.SmallInteger(), nullable=False),
        sa.Column("starts", sa.Time(), nullable=False),
        sa.Column("ends", sa.Time(), nullable=False),
        sa.UniqueConstraint("staff_id", "week_start", "day", name="uq_weekly_shifts_staff_day"),
        sa.CheckConstraint("extract(isodow from week_start) = 1", name="week_starts_monday"),
        sa.CheckConstraint("day BETWEEN 0 AND 6", name="day_of_week"),
        sa.CheckConstraint("ends > starts", name="ends_after_starts"),
    )

    op.create_table(
        "time_off",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        _staff("CASCADE"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(60), nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name="ends_after_starts"),
    )
    op.create_index("ix_time_off_staff_id", "time_off", ["staff_id"])

    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "location_id",
            sa.Uuid(),
            sa.ForeignKey("locations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        _staff("RESTRICT"),
        sa.Column(
            "service_id",
            sa.Uuid(),
            sa.ForeignKey("services.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "consumer_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("guest_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", STATUS, nullable=False),
        sa.Column("source", SOURCE, nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column(
            "created_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("ends_at > starts_at", name="ends_after_starts"),
        sa.CheckConstraint(
            "consumer_user_id IS NOT NULL OR guest_encrypted IS NOT NULL", name="has_a_client"
        ),
        # LLD 5.1: the database, not the app, is the authority on double bookings.
        postgresql.ExcludeConstraint(
            ("staff_id", "="),
            (sa.text("tstzrange(starts_at, ends_at)"), "&&"),
            name="no_double_booking",
            using="gist",
            where=sa.text("status <> 'cancelled'"),
        ),
    )
    op.create_index("ix_bookings_business_id", "bookings", ["business_id"])
    op.create_index("ix_bookings_consumer_user_id", "bookings", ["consumer_user_id"])
    op.create_index("ix_bookings_location_starts", "bookings", ["location_id", "starts_at"])


def downgrade() -> None:
    op.drop_table("bookings")
    SOURCE.drop(op.get_bind())
    STATUS.drop(op.get_bind())
    op.drop_table("time_off")
    op.drop_table("weekly_shifts")
