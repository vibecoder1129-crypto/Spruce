import enum
import uuid

from sqlalchemy import Enum, ForeignKey, LargeBinary, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models_base import CreatedMixin, IdMixin


class ClientSource(enum.StrEnum):
    imported = "imported"
    added = "added"


class Client(IdMixin, CreatedMixin, Base):
    """A business's own client record (HLD 4.8). Only that business ever sees it."""

    __tablename__ = "clients"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Name, phone, email and notes as one encrypted JSON blob.
    details_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # Keyed HMACs of the normalised email and phone digits, to find duplicates.
    email_index: Mapped[bytes | None] = mapped_column(LargeBinary)
    phone_index: Mapped[bytes | None] = mapped_column(LargeBinary)
    source: Mapped[ClientSource] = mapped_column(
        Enum(ClientSource, name="client_source"), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("business_id", "email_index", name="uq_clients_business_email"),
        UniqueConstraint("business_id", "phone_index", name="uq_clients_business_phone"),
    )
