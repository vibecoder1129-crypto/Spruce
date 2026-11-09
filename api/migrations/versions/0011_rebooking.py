"""Rebooking reminders: weeks per service, a customer opt-out, and once per visit (slice 9).

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("rebook_weeks", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "rebook_weeks_choices", "services", "rebook_weeks IN (0, 2, 3, 4, 6, 8, 12, 26)"
    )
    op.add_column(
        "users",
        sa.Column("rebook_reminders", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column("bookings", sa.Column("rebook_reminded_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("bookings", "rebook_reminded_at")
    op.drop_column("users", "rebook_reminders")
    op.drop_constraint("rebook_weeks_choices", "services", type_="check")
    op.drop_column("services", "rebook_weeks")
