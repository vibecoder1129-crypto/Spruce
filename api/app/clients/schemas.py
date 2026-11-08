import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.business.schemas import Strict

Text = Annotated[str, StringConstraints(strip_whitespace=True)]


class ClientRow(Strict):
    # Generous caps bound the request. The real checks run per row, so one bad row can't sink
    # the whole file.
    name: Annotated[Text, StringConstraints(max_length=200)] = ""
    phone: Annotated[Text, StringConstraints(max_length=40)] | None = None
    email: Annotated[Text, StringConstraints(max_length=254)] | None = None
    notes: Annotated[Text, StringConstraints(max_length=1000)] | None = None


class ImportIn(Strict):
    rows: Annotated[list[ClientRow], Field(min_length=1, max_length=5000)]
    dry_run: bool = False


class InvalidRow(BaseModel):
    row: int
    reason: str


class ImportOut(BaseModel):
    total: int
    added: int
    duplicates: int
    invalid: list[InvalidRow]


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str | None
    email: str | None
    notes: str
    source: str
    created_at: datetime
