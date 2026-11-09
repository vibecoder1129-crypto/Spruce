"""Support access: owners let a platform admin help as them for a while (slice 8).

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("support_until", sa.DateTime(timezone=True)))
    op.add_column(
        "sessions",
        sa.Column("support_admin_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE")),
    )


def downgrade() -> None:
    op.drop_column("sessions", "support_admin_id")
    op.drop_column("businesses", "support_until")
