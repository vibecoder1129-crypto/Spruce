"""Outbound email. Dev prints to the terminal, tests collect messages in memory,
production sends through Brevo's transactional API (EU provider)."""

import logging
import sys
from dataclasses import dataclass

import httpx

from app.config import get_settings

log = logging.getLogger("spruce.email")


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str


outbox: list[Email] = []  # memory backend only


async def send(message: Email) -> None:
    settings = get_settings()
    if settings.email_backend == "memory":
        outbox.append(message)
    elif settings.email_backend == "console":
        sys.stdout.write(f"\n--- email to {message.to}: {message.subject}\n{message.text}\n---\n")
    else:
        key = settings.brevo_api_key
        if key is None:
            raise RuntimeError("SPRUCE_BREVO_API_KEY is not set")
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": key.get_secret_value()},
                json={
                    "sender": {"email": settings.email_from, "name": settings.brand_name},
                    "to": [{"email": message.to}],
                    "subject": message.subject,
                    "textContent": message.text,
                },
            )
        if response.status_code >= 300:
            log.error("email send failed", extra={"status": response.status_code})
            response.raise_for_status()
