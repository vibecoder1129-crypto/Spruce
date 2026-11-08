"""Append-only audit log (HLD 6, LLD 3.6).

The table rejects UPDATE and DELETE with a database trigger, so even application bugs or a
compromised app role cannot rewrite history. Metadata must never contain personal data.
"""

import uuid
from typing import Any

from sqlalchemy import JSON, String, Uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class AuditLog(IdMixin, CreatedMixin, Base):
    __tablename__ = "audit_log"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    action_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


def audit(
    db: AsyncSession,
    *,
    actor: uuid.UUID | None,
    action: str,
    target_type: str,
    target_id: uuid.UUID | str,
    **metadata: Any,
) -> None:
    """Stage an audit entry in the caller's transaction, so it commits or rolls back with it."""
    db.add(
        AuditLog(
            actor_user_id=actor,
            action_type=action,
            target_type=target_type,
            target_id=str(target_id),
            metadata_json=metadata,
        )
    )
