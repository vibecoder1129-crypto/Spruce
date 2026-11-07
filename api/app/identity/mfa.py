"""TOTP (RFC 6238) with replay protection, plus single-use recovery codes."""

import hmac
import secrets
from datetime import UTC, datetime

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.crypto import decrypt, encrypt, hash_token
from app.identity.models import RecoveryCode, User
from app.models_base import utcnow

_CONTEXT = "users.mfa_secret"


def new_secret(user: User, email: str) -> tuple[str, str]:
    secret = pyotp.random_base32()
    user.mfa_secret_encrypted = encrypt(secret, _CONTEXT)
    uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=get_settings().brand_name)
    return secret, uri


def check_totp(user: User, code: str) -> bool:
    """Accept the current code or one step either side, never a step already used."""
    if user.mfa_secret_encrypted is None or not code.isdigit() or len(code) != 6:
        return False
    totp = pyotp.TOTP(decrypt(user.mfa_secret_encrypted, _CONTEXT))
    current = totp.timecode(datetime.now(UTC))
    for step in (current - 1, current, current + 1):
        expected = totp.generate_otp(step)
        if hmac.compare_digest(expected, code) and step > (user.mfa_last_step or -1):
            user.mfa_last_step = step
            return True
    return False


def _normalize(code: str) -> str:
    return code.replace("-", "").replace(" ", "").lower()


async def new_recovery_codes(db: AsyncSession, user: User) -> list[str]:
    existing = await db.scalars(select(RecoveryCode).where(RecoveryCode.user_id == user.id))
    for row in existing:
        await db.delete(row)
    codes = [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(10)]
    for code in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=hash_token(_normalize(code))))
    return codes


async def use_recovery_code(db: AsyncSession, user: User, code: str) -> bool:
    row = await db.scalar(
        select(RecoveryCode)
        .where(
            RecoveryCode.user_id == user.id,
            RecoveryCode.code_hash == hash_token(_normalize(code)),
            RecoveryCode.used_at.is_(None),
        )
        .with_for_update()
    )
    if row is None:
        return False
    row.used_at = utcnow()
    return True
