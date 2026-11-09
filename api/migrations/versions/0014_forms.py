"""Consultation forms and patch tests (slice 13).

Revision ID: 0014
Revises: 0013
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consultation_forms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "business_id",
            sa.Uuid(),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("questions", JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.add_column(
        "services",
        sa.Column(
            "form_id", sa.Uuid(), sa.ForeignKey("consultation_forms.id", ondelete="SET NULL")
        ),
    )
    op.create_index("ix_services_form_id", "services", ["form_id"])
    op.add_column(
        "services",
        sa.Column("needs_patch_test", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_table(
        "form_answers",
        sa.Column(
            "booking_id",
            sa.Uuid(),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("answers_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column("customer_profiles", sa.Column("patch_test_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("customer_profiles", "patch_test_at")
    op.drop_table("form_answers")
    op.drop_column("services", "needs_patch_test")
    op.drop_index("ix_services_form_id", "services")
    op.drop_column("services", "form_id")
    op.drop_table("consultation_forms")
