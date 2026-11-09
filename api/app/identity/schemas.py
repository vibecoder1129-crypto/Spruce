import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.identity.models import Role

TERMS_VERSION = "2026-11"

Password = Field(min_length=12, max_length=128)


class SignupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: str = Password
    # Staff and platform admins are never self-registered; owners invite staff (slice 3).
    role: Literal[Role.consumer, Role.owner] = Role.consumer
    accept_terms: Literal[True]


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: str = Field(max_length=128)


class CodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=6, max_length=20)


class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=100)


class EmailIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)


class ResetConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=100)
    password: str = Password


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    role: Role
    email_verified: bool
    mfa_enabled: bool
    # True while an owner/admin still has to enrol in or pass MFA on this session.
    mfa_pending: bool
    timezone: str
    language: str
    # True while a platform admin is helping as this owner (slice 8).
    support: bool = False


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class CsrfOut(BaseModel):
    csrf_token: str
