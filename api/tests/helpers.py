import re

import pyotp
from httpx import AsyncClient, Response

from app import email as mail

PASSWORD = "correct horse battery"


async def signup(
    client: AsyncClient, email: str = "ana@example.lv", role: str = "consumer"
) -> Response:
    return await client.post(
        "/auth/signup",
        json={"email": email, "password": PASSWORD, "role": role, "accept_terms": True},
    )


async def login(
    client: AsyncClient, email: str = "ana@example.lv", password: str = PASSWORD
) -> Response:
    return await client.post("/auth/login", json={"email": email, "password": password})


def last_link_token(path: str) -> str:
    message = mail.outbox[-1]
    match = re.search(rf"{path}\?token=([\w-]+)", message.text)
    assert match, message.text
    return match.group(1)


async def enrol_mfa(client: AsyncClient) -> tuple[pyotp.TOTP, list[str]]:
    secret = (await client.post("/auth/mfa/setup")).json()["secret"]
    totp = pyotp.TOTP(secret)
    response = await client.post("/auth/mfa/enable", json={"code": totp.now()})
    assert response.status_code == 200, response.text
    return totp, response.json()["recovery_codes"]


async def owner(client: AsyncClient, email: str = "owner@example.lv") -> None:
    """Sign up an owner and finish two-step setup, so the session is fully signed in."""
    assert (await signup(client, email, role="owner")).status_code == 201
    await enrol_mfa(client)


async def platform_admin(client: AsyncClient, email: str = "admin@example.com") -> None:
    from app.cli import create_admin
    from app.db import get_sessionmaker

    async with get_sessionmaker()() as db:
        await create_admin(db, email, PASSWORD)
    assert (await login(client, email)).status_code == 200
    await enrol_mfa(client)


LOCATION = {
    "name": "Old Town",
    "street": "Kalku iela 1",
    "postal_code": "LV-1050",
    "city": "Riga",
    "country_code": "LV",
    "timezone": "Europe/Riga",
}


async def onboarded(client: AsyncClient, *, submit: bool = True) -> str:
    """An owner's business with one location and one staff member. Returns its id."""
    business = await client.post("/businesses", json={"name": "Linden Studio", "category": "hair"})
    assert business.status_code == 201, business.text
    business_id: str = business.json()["id"]
    location = await client.post(f"/businesses/{business_id}/locations", json=LOCATION)
    assert location.status_code == 201, location.text
    staff = await client.post(
        f"/businesses/{business_id}/staff",
        json={"display_name": "Marta", "title": "Stylist", "location_id": location.json()["id"]},
    )
    assert staff.status_code == 201, staff.text
    if submit:
        assert (await client.post(f"/businesses/{business_id}/submit")).status_code == 200
    return business_id
