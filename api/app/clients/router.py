"""Business-local clients and import from another booking app (HLD 4.8, LLD 3.5)."""

import json
import re
import uuid

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter
from sqlalchemy import select

from app.audit import audit
from app.business.router import Owner, _owned
from app.clients.models import Client, ClientSource
from app.clients.schemas import ClientOut, ClientRow, ImportIn, ImportOut, InvalidRow
from app.crypto import blind_index, decrypt, encrypt, normalize_email
from app.identity.deps import Db
from app.ratelimit import hit

router = APIRouter(tags=["clients"])

CONTEXT = "clients.details"


def _phone_digits(phone: str) -> str:
    return re.sub(r"\D", "", phone)


def _email_key(business_id: uuid.UUID, email: str) -> bytes:
    return blind_index(normalize_email(email), f"clients.email.{business_id}")


def _phone_key(business_id: uuid.UUID, phone: str) -> bytes:
    return blind_index(_phone_digits(phone), f"clients.phone.{business_id}")


def _problem(row: ClientRow) -> str | None:
    if not row.name:
        return "Name is missing."
    if row.email:
        try:
            validate_email(row.email, check_deliverability=False)
        except EmailNotValidError:
            return "Email doesn't look right."
    if row.phone and not 6 <= len(_phone_digits(row.phone)) <= 15:
        return "Phone needs 6 to 15 digits."
    return None


@router.get("/businesses/{business_id}/clients")
async def list_clients(business_id: uuid.UUID, auth: Owner, db: Db) -> list[ClientOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(select(Client).where(Client.business_id == business.id))
    out = []
    for c in rows:
        details = json.loads(decrypt(c.details_encrypted, CONTEXT))
        out.append(
            ClientOut(
                id=c.id,
                name=details["name"],
                phone=details.get("phone"),
                email=details.get("email"),
                notes=details.get("notes") or "",
                source=c.source.value,
                created_at=c.created_at,
            )
        )
    return sorted(out, key=lambda c: c.name.casefold())


@router.post("/businesses/{business_id}/clients/import")
async def import_clients(business_id: uuid.UUID, body: ImportIn, auth: Owner, db: Db) -> ImportOut:
    """Adds valid rows that aren't already in the list. A dry run only counts."""
    business = await _owned(db, auth, business_id)
    await hit("clients_import", str(business.id), limit=20, window_seconds=3600)

    existing = (
        await db.execute(
            select(Client.email_index, Client.phone_index).where(Client.business_id == business.id)
        )
    ).all()
    emails = {e for e, _ in existing if e}
    phones = {p for _, p in existing if p}

    invalid: list[InvalidRow] = []
    duplicates = 0
    added = 0
    for number, row in enumerate(body.rows, start=1):
        if problem := _problem(row):
            invalid.append(InvalidRow(row=number, reason=problem))
            continue
        email_key = _email_key(business.id, row.email) if row.email else None
        phone_key = _phone_key(business.id, row.phone) if row.phone else None
        if (email_key and email_key in emails) or (phone_key and phone_key in phones):
            duplicates += 1
            continue
        if email_key:
            emails.add(email_key)
        if phone_key:
            phones.add(phone_key)
        added += 1
        if not body.dry_run:
            details = {"name": row.name, "phone": row.phone, "email": row.email, "notes": row.notes}
            db.add(
                Client(
                    business_id=business.id,
                    details_encrypted=encrypt(json.dumps(details), CONTEXT),
                    email_index=email_key,
                    phone_index=phone_key,
                    source=ClientSource.imported,
                )
            )

    if not body.dry_run:
        audit(
            db,
            actor=auth.user.id,
            action="clients.imported",
            target_type="business",
            target_id=business.id,
            added=added,
            duplicates=duplicates,
            invalid=len(invalid),
        )
        await db.commit()
    return ImportOut(total=len(body.rows), added=added, duplicates=duplicates, invalid=invalid)
