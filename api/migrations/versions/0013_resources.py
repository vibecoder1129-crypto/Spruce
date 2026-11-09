"""Rooms and equipment (slice 12): a service can need one free resource for the whole visit.

Revision ID: 0013
Revises: 0012
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resources",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "location_id",
            sa.Uuid(),
            sa.ForeignKey("locations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "service_resources",
        sa.Column(
            "service_id",
            sa.Uuid(),
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "resource_id",
            sa.Uuid(),
            sa.ForeignKey("resources.id", ondelete="CASCADE"),
            primary_key=True,
            index=True,
        ),
    )
    op.add_column(
        "bookings",
        sa.Column("resource_id", sa.Uuid(), sa.ForeignKey("resources.id", ondelete="SET NULL")),
    )
    op.create_index("ix_bookings_resource_id", "bookings", ["resource_id"])
    # The database, not the app, stops two visits sharing a room at once (as no_double_booking).
    op.execute(
        "ALTER TABLE bookings ADD CONSTRAINT no_double_resource EXCLUDE USING gist"
        " (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)"
        " WHERE (status <> 'cancelled' AND resource_id IS NOT NULL)"
    )


def downgrade() -> None:
    op.drop_constraint("no_double_resource", "bookings")
    op.drop_index("ix_bookings_resource_id", "bookings")
    op.drop_column("bookings", "resource_id")
    op.drop_table("service_resources")
    op.drop_table("resources")
