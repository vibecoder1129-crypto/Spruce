"""Encryption and hashing helpers.

- Personal data (email, phone) is stored encrypted with AES-256-GCM. A random 96-bit nonce is
  prepended to each ciphertext. The column name is passed as associated data, so a ciphertext
  copied into another column fails to decrypt.
- Email lookup uses a keyed HMAC blind index, so the database never holds a plain email and an
  attacker with a dump cannot test guesses without the key.
- Tokens (session, reset, verify) are random and stored as SHA-256 hashes only.
"""

import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

_hasher = PasswordHasher()  # argon2id with the library's current recommended parameters
# Verifying against this keeps login timing the same whether or not the account exists.
_DUMMY_HASH = _hasher.hash(secrets.token_hex(16))


def _key(value: str, name: str) -> bytes:
    raw = base64.b64decode(value)
    if len(raw) != 32:
        raise ValueError(f"{name} must be 32 bytes, base64-encoded")
    return raw


@lru_cache
def _aes() -> AESGCM:
    return AESGCM(_key(get_settings().data_key.get_secret_value(), "SPRUCE_DATA_KEY"))


@lru_cache
def _index_key() -> bytes:
    return _key(get_settings().index_key.get_secret_value(), "SPRUCE_INDEX_KEY")


def encrypt(plaintext: str, context: str) -> bytes:
    nonce = secrets.token_bytes(12)
    return nonce + _aes().encrypt(nonce, plaintext.encode(), context.encode())


def decrypt(blob: bytes, context: str) -> str:
    return _aes().decrypt(blob[:12], blob[12:], context.encode()).decode()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def email_index(email: str) -> bytes:
    return hmac.new(_index_key(), normalize_email(email).encode(), hashlib.sha256).digest()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()
