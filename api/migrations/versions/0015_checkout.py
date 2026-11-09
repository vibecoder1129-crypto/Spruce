"""Checkout, commissions and tips (slice 14).

Revision ID: 0015
Revises: 0014
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

METHOD = sa.Enum("card", "cash", "other", name="payment_method")


def upgrade() -> None:
    op.add_column(
        "staff_profiles",
        sa.Column("commission_percent", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "commission_percent_range", "staff_profiles", "commission_percent BETWEEN 0 AND 100"
    )
    op.create_table(
        "sales",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "staff_id",
            sa.Uuid(),
            sa.ForeignKey("staff_profiles.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("price_minor", sa.Integer(), nullable=False),
        sa.Column("tip_minor", sa.Integer(), nullable=False),
        sa.Column("method", METHOD, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("commission_minor", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "price_minor >= 0 AND tip_minor >= 0 AND commission_minor >= 0",
            name="amounts_not_negative",
        ),
    )
    op.create_index("ix_sales_business_created", "sales", ["business_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_business_created", "sales")
    op.drop_table("sales")
    METHOD.drop(op.get_bind())
    op.drop_constraint("commission_percent_range", "staff_profiles")
    op.drop_column("staff_profiles", "commission_percent")
