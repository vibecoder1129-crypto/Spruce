"""Services, staff-service assignment, permission grants and staff invites.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

CATEGORY = postgresql.ENUM(name="business_category", create_type=False)
FLAG = sa.Enum(
    "calendar.view",
    "calendar.team",
    "appointments.own",
    "checkout.own",
    "reports.own",
    "chat.personal",
    name="permission_flag",
)


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", sa.Uuid(), primary_key=True)


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    op.add_column(
        "staff_profiles",
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    # One business per staff login (LLD 3.1: "v1 assumes one").
    op.drop_index("ix_staff_profiles_user_id", "staff_profiles")
    op.create_unique_constraint("uq_staff_profiles_user_id", "staff_profiles", ["user_id"])
    op.create_foreign_key(
        "fk_sessions_staff_id",
        "sessions",
        "staff_profiles",
        ["staff_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_table(
        "services",
        _id(),
        _created(),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("category", CATEGORY, nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "duration_minutes BETWEEN 5 AND 480 AND duration_minutes % 5 = 0",
            name="duration_in_steps",
        ),
        sa.CheckConstraint("price_minor >= 0", name="price_not_negative"),
    )
    op.create_index("ix_services_business_id", "services", ["business_id"])

    op.create_table(
        "staff_services",
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "service_id",
            sa.Uuid(),
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_staff_services_service_id", "staff_services", ["service_id"])

    op.create_table(
        "permission_grants",
        _id(),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("flag_key", FLAG, nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "granted_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_permission_grants_active",
        "permission_grants",
        ["staff_id", "flag_key"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    op.create_table(
        "staff_invites",
        _id(),
        _created(),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email_index", sa.LargeBinary(32), nullable=False),
        sa.Column("email_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(32), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "invited_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
    )
    op.create_index("ix_staff_invites_staff_id", "staff_invites", ["staff_id"])


def downgrade() -> None:
    op.drop_table("staff_invites")
    op.drop_table("permission_grants")
    FLAG.drop(op.get_bind())
    op.drop_table("staff_services")
    op.drop_table("services")
    op.drop_constraint("fk_sessions_staff_id", "sessions", type_="foreignkey")
    op.drop_constraint("uq_staff_profiles_user_id", "staff_profiles", type_="unique")
    op.create_index("ix_staff_profiles_user_id", "staff_profiles", ["user_id"])
    op.drop_column("staff_profiles", "active")
