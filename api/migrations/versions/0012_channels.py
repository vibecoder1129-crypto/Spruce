"""Where an online booking came from: the venue's website, Instagram, Google or Facebook (slice 10).

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("channel", sa.String(16)))
    op.create_check_constraint(
        "booking_channels", "bookings", "channel IN ('website', 'instagram', 'google', 'facebook')"
    )


def downgrade() -> None:
    op.drop_constraint("booking_channels", "bookings", type_="check")
    op.drop_column("bookings", "channel")
