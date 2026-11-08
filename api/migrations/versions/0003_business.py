"""Business onboarding: businesses, locations (with a PostGIS point), staff profiles.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

CATEGORY = sa.Enum(
    "hair",
    "barber",
    "nails",
    "brows_lashes",
    "makeup",
    "skin",
    "massage",
    "spa",
    "wellness",
    name="business_category",
)
STATUS = sa.Enum("pending", "approved", "rejected", "suspended", name="approval_status")
REASON = sa.Enum(
    "invalid_documents",
    "incomplete_profile",
    "duplicate_listing",
    "category_not_supported",
    "suspicious_info",
    "out_of_launch_area",
    "policy_violation",
    "other",
    name="reject_reason",
)


def _id_created() -> list[sa.Column]:  # type: ignore[type-arg]
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "businesses",
        sa.Column(
            "owner_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", CATEGORY, nullable=False),
        sa.Column("approval_status", STATUS, nullable=False),
        sa.Column("rejection_reason", REASON, nullable=True),
        sa.Column("rejection_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        *_id_created(),
        sa.CheckConstraint(
            "(approval_status = 'rejected') = (rejection_reason IS NOT NULL)",
            name="rejection_has_reason",
        ),
    )
    op.create_index("ix_businesses_review_queue", "businesses", ["approval_status", "submitted_at"])
    op.create_table(
        "locations",
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("street", sa.String(length=160), nullable=False),
        sa.Column("postal_code", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=80), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("address_text", sa.String(length=300), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        *_id_created(),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
    )
    op.create_index("ix_locations_business_id", "locations", ["business_id"])
    # Radius search (slice 5) runs on this generated point; nothing writes it directly.
    op.execute(
        """
        ALTER TABLE locations ADD COLUMN geog geography(Point, 4326)
          GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)
          STORED;
        CREATE INDEX ix_locations_geog ON locations USING gist (geog);
        """
    )
    op.create_table(
        "staff_profiles",
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
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=False),
        *_id_created(),
    )
    op.create_index("ix_staff_profiles_business_id", "staff_profiles", ["business_id"])
    op.create_index("ix_staff_profiles_location_id", "staff_profiles", ["location_id"])
    op.create_index("ix_staff_profiles_user_id", "staff_profiles", ["user_id"])


def downgrade() -> None:
    op.drop_table("staff_profiles")
    op.drop_table("locations")
    op.drop_table("businesses")
    for enum in (REASON, STATUS, CATEGORY):
        enum.drop(op.get_bind())
    # PostGIS stays: other extensions (the postgis image adds topology and tiger) depend on it.
