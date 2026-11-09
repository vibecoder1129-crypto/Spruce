from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import email as mail
from app.audit import audit
from app.config import get_settings
from app.cookies import CSRF_COOKIE, REFRESH_COOKIE, set_cookie
from app.crypto import (
    decrypt,
    email_index,
    encrypt,
    hash_password,
    hash_token,
    new_token,
    normalize_email,
    password_needs_rehash,
    verify_password,
)
from app.identity import mfa
from app.identity.deps import Auth, Db, FullySignedIn, SignedIn, client_ip
from app.identity.models import OneTimeToken, TokenPurpose, User
from app.identity.schemas import (
    TERMS_VERSION,
    CodeIn,
    CsrfOut,
    EmailIn,
    LoginIn,
    MeOut,
    MfaSetupOut,
    RecoveryCodesOut,
    ResetConfirmIn,
    SignupIn,
    TokenIn,
)
from app.identity.sessions import clear_auth_cookies, revoke_all, rotate, start_session
from app.models_base import utcnow
from app.ratelimit import hit

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["account"])

EMAIL_CONTEXT = "users.email"
MAX_FAILED_LOGINS = 10
LOCKOUT = timedelta(minutes=15)
TOKEN_TTL = {
    TokenPurpose.verify_email: timedelta(days=2),
    TokenPurpose.reset_password: timedelta(hours=1),
}
BAD_LOGIN = "Email or password is incorrect."


def user_email(user: User) -> str:
    return decrypt(user.email_encrypted, EMAIL_CONTEXT)


def me_out(auth: Auth) -> MeOut:
    user = auth.user
    return MeOut(
        id=user.id,
        email=user_email(user),
        role=user.role,
        email_verified=user.email_verified_at is not None,
        mfa_enabled=user.mfa_enabled,
        mfa_pending=auth.mfa_pending,
        timezone=user.timezone,
        language=user.language,
        support=auth.session.support_admin_id is not None,
    )


async def _send_token(db: AsyncSession, user: User, purpose: TokenPurpose) -> None:
    token = new_token()
    db.add(
        OneTimeToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(token),
            expires_at=utcnow() + TOKEN_TTL[purpose],
        )
    )
    settings = get_settings()
    brand = settings.brand_name
    if purpose is TokenPurpose.verify_email:
        link = f"{settings.app_base_url}/verify-email?token={token}"
        subject = f"Confirm your email for {brand}"
        text = (
            f"Confirm your email address to finish setting up {brand}:\n\n{link}\n\n"
            "The link works for 48 hours."
        )
    else:
        link = f"{settings.app_base_url}/reset-password?token={token}"
        subject = f"Reset your {brand} password"
        text = (
            f"Someone asked to reset the password for this {brand} account.\n\n{link}\n\n"
            "The link works for 1 hour. If it wasn't you, ignore this email: nothing changes."
        )
    await mail.send(mail.Email(to=user_email(user), subject=subject, text=text))


async def _consume_token(db: AsyncSession, token: str, purpose: TokenPurpose) -> OneTimeToken:
    row = await db.scalar(
        select(OneTimeToken)
        .where(
            OneTimeToken.token_hash == hash_token(token),
            OneTimeToken.purpose == purpose,
            OneTimeToken.used_at.is_(None),
            OneTimeToken.expires_at > utcnow(),
        )
        .with_for_update()
    )
    if row is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="This link has expired or was already used."
        )
    row.used_at = utcnow()
    return row


@router.get("/csrf")
async def csrf(response: Response) -> CsrfOut:
    token = new_token()
    set_cookie(response, CSRF_COOKIE, token, max_age=12 * 3600)
    return CsrfOut(csrf_token=token)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, request: Request, response: Response, db: Db) -> MeOut:
    await hit("signup", client_ip(request), limit=10, window_seconds=3600)
    index = email_index(body.email)
    if await db.scalar(select(User.id).where(User.email_index == index)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Log in instead.",
        )
    user = User(
        email_index=index,
        email_encrypted=encrypt(normalize_email(body.email), EMAIL_CONTEXT),
        password_hash=hash_password(body.password),
        role=body.role,
        terms_version=TERMS_VERSION,
        terms_accepted_at=utcnow(),
    )
    db.add(user)
    await db.flush()
    session = await start_session(db, user, response)
    audit(
        db,
        actor=user.id,
        action="user.signup",
        target_type="user",
        target_id=user.id,
        role=user.role,
    )
    await _send_token(db, user, TokenPurpose.verify_email)
    await db.commit()
    return me_out(Auth(session, user))


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: Db) -> MeOut:
    await hit("login-ip", client_ip(request), limit=30, window_seconds=300)
    await hit("login-email", normalize_email(body.email), limit=10, window_seconds=900)
    user = await db.scalar(
        select(User).where(User.email_index == email_index(body.email)).with_for_update()
    )
    now = utcnow()
    if user is not None and user.locked_until is not None and user.locked_until > now:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait a few minutes and try again.",
        )
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILED_LOGINS:
                user.locked_until = now + LOCKOUT
                user.failed_logins = 0
                audit(
                    db, actor=user.id, action="user.locked", target_type="user", target_id=user.id
                )
            await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=BAD_LOGIN)
    user.failed_logins = 0
    user.locked_until = None
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    session = await start_session(db, user, response)
    audit(db, actor=user.id, action="user.login", target_type="session", target_id=session.id)
    await db.commit()
    return me_out(Auth(session, user))


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh(request: Request, response: Response, db: Db) -> Response:
    token = request.cookies.get(REFRESH_COOKIE.name)
    session = await rotate(db, token, response) if token else None
    await db.commit()  # also persists a reuse-triggered revocation
    if session is None:
        denied = JSONResponse({"detail": "Please log in."}, status_code=401)
        clear_auth_cookies(denied)
        return denied
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(auth: SignedIn, response: Response, db: Db) -> None:
    auth.session.revoked_at = utcnow()
    audit(
        db,
        actor=auth.user.id,
        action="user.logout",
        target_type="session",
        target_id=auth.session.id,
    )
    await db.commit()
    clear_auth_cookies(response)


@router.post("/logout-everywhere", status_code=status.HTTP_204_NO_CONTENT)
async def logout_everywhere(auth: FullySignedIn, response: Response, db: Db) -> None:
    await revoke_all(db, auth.user.id)
    audit(
        db, actor=auth.user.id, action="user.logout_all", target_type="user", target_id=auth.user.id
    )
    await db.commit()
    clear_auth_cookies(response)


@router.post("/mfa/setup")
async def mfa_setup(auth: SignedIn, db: Db) -> MfaSetupOut:
    if auth.user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Two-step verification is already on.")
    secret, uri = mfa.new_secret(auth.user, user_email(auth.user))
    await db.commit()
    return MfaSetupOut(secret=secret, otpauth_uri=uri)


@router.post("/mfa/enable")
async def mfa_enable(body: CodeIn, auth: SignedIn, db: Db) -> RecoveryCodesOut:
    await hit("mfa", str(auth.session.id), limit=10, window_seconds=300)
    user = auth.user
    if user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Two-step verification is already on.")
    if not mfa.check_totp(user, body.code):
        await db.commit()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="That code didn't match. Try the newest one."
        )
    user.mfa_enabled = True
    auth.session.mfa_verified = True
    codes = await mfa.new_recovery_codes(db, user)
    audit(db, actor=user.id, action="mfa.enabled", target_type="user", target_id=user.id)
    await db.commit()
    return RecoveryCodesOut(recovery_codes=codes)


@router.post("/mfa/verify")
async def mfa_verify(body: CodeIn, auth: SignedIn, db: Db) -> MeOut:
    await hit("mfa", str(auth.session.id), limit=10, window_seconds=300)
    user = auth.user
    if not user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Set up two-step verification first.")
    ok = mfa.check_totp(user, body.code) or await mfa.use_recovery_code(db, user, body.code)
    if not ok:
        await db.commit()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="That code didn't match. Try the newest one."
        )
    auth.session.mfa_verified = True
    audit(
        db, actor=user.id, action="mfa.verified", target_type="session", target_id=auth.session.id
    )
    await db.commit()
    return me_out(auth)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(body: TokenIn, db: Db) -> None:
    row = await _consume_token(db, body.token, TokenPurpose.verify_email)
    user = await db.get(User, row.user_id)
    if user is not None and user.email_verified_at is None:
        user.email_verified_at = utcnow()
    await db.commit()


@router.post("/verify-email/resend", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(auth: SignedIn, db: Db) -> None:
    await hit("verify-resend", str(auth.user.id), limit=3, window_seconds=3600)
    if auth.user.email_verified_at is None:
        await _send_token(db, auth.user, TokenPurpose.verify_email)
        await db.commit()


@router.post("/password-reset", status_code=status.HTTP_202_ACCEPTED)
async def request_reset(body: EmailIn, request: Request, db: Db) -> None:
    """Always 202, so the response never reveals whether an account exists."""
    await hit("reset-ip", client_ip(request), limit=10, window_seconds=3600)
    await hit("reset-email", normalize_email(body.email), limit=3, window_seconds=3600)
    user = await db.scalar(select(User).where(User.email_index == email_index(body.email)))
    if user is not None:
        await _send_token(db, user, TokenPurpose.reset_password)
        await db.commit()


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_reset(body: ResetConfirmIn, response: Response, db: Db) -> None:
    row = await _consume_token(db, body.token, TokenPurpose.reset_password)
    user = await db.get(User, row.user_id, with_for_update=True)
    if user is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="This link has expired or was already used."
        )
    user.password_hash = hash_password(body.password)
    user.failed_logins = 0
    user.locked_until = None
    # A reset proves control of the inbox, so it also counts as email verification.
    user.email_verified_at = user.email_verified_at or utcnow()
    await revoke_all(db, user.id)
    audit(db, actor=user.id, action="user.password_reset", target_type="user", target_id=user.id)
    await db.commit()
    clear_auth_cookies(response)


@me_router.get("/me")
async def me(auth: SignedIn) -> MeOut:
    """Works mid-MFA too, so the web app can tell the person what step comes next."""
    return me_out(auth)
