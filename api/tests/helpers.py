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
