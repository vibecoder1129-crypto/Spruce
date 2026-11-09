"""Cancellation window and per-venue customer profiles (no-shows, regulars).

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("cancel_window_hours", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "cancel_window_choices", "businesses", "cancel_window_hours IN (0, 2, 6, 12, 24, 48)"
    )
    op.create_table(
        "customer_profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "consumer_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("no_show_streak", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completed_count", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint("business_id", "consumer_user_id", name="uq_customer_profiles_pair"),
    )
    op.create_index(
        "ix_customer_profiles_consumer_user_id", "customer_profiles", ["consumer_user_id"]
    )


def downgrade() -> None:
    op.drop_table("customer_profiles")
    op.drop_constraint("cancel_window_choices", "businesses", type_="check")
    op.drop_column("businesses", "cancel_window_hours")
