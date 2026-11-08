"""Business-local clients.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clients",
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
        sa.Column("details_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("email_index", sa.LargeBinary()),
        sa.Column("phone_index", sa.LargeBinary()),
        sa.Column(
            "source",
            sa.Enum("imported", "added", name="client_source"),
            nullable=False,
        ),
        sa.UniqueConstraint("business_id", "email_index", name="uq_clients_business_email"),
        sa.UniqueConstraint("business_id", "phone_index", name="uq_clients_business_phone"),
    )
    op.create_index("ix_clients_business_id", "clients", ["business_id"])


def downgrade() -> None:
    op.drop_table("clients")
    sa.Enum(name="client_source").drop(op.get_bind())
