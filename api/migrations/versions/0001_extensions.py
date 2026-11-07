"""Enable the Postgres extensions the design relies on.

btree_gist backs the booking EXCLUDE constraint (LLD 5.1); PostGIS is enabled in slice 2,
when locations arrive.

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS btree_gist")
