import time

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app import email as mail
from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import PASSWORD, enrol_mfa, last_link_token, login, signup

# --- signup ---------------------------------------------------------------------------------


async def test_signup_signs_in_and_sends_verification(client: AsyncClient) -> None:
    response = await signup(client)
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ana@example.lv"
    assert body["role"] == "consumer"
    assert body["email_verified"] is False
    assert body["mfa_pending"] is False
    assert (await client.get("/me")).status_code == 200
    assert mail.outbox[-1].to == "ana@example.lv"
    assert "/verify-email?token=" in mail.outbox[-1].text


async def test_email_is_never_stored_in_plain_text(client: AsyncClient) -> None:
    await signup(client, "Ana@Example.lv")
    async with get_engine().connect() as conn:
        row = (await conn.execute(text("SELECT * FROM users"))).mappings().one()
    dump = repr(dict(row)).lower()
    assert "ana@example.lv" not in dump
    assert "example" not in dump


async def test_signup_records_terms_consent(client: AsyncClient) -> None:
    await signup(client)
    async with get_engine().connect() as conn:
        version = await conn.scalar(text("SELECT terms_version FROM users"))
    assert version


async def test_duplicate_email_is_refused_case_insensitively(client: AsyncClient) -> None:
    await signup(client, "ana@example.lv")
    async with new_client() as other:
        response = await signup(other, "ANA@example.lv")
    assert response.status_code == 409


@pytest.mark.parametrize("role", ["staff", "admin"])
async def test_staff_and_admin_cannot_self_register(client: AsyncClient, role: str) -> None:
    assert (await signup(client, role=role)).status_code == 422


@pytest.mark.parametrize(
    "patch",
    [{"password": "short"}, {"accept_terms": False}, {"email": "not-an-email"}, {"extra": 1}],
)
async def test_signup_validates_input(client: AsyncClient, patch: dict[str, object]) -> None:
    payload = {"email": "ana@example.lv", "password": PASSWORD, "accept_terms": True} | patch
    assert (await client.post("/auth/signup", json=payload)).status_code == 422


# --- CSRF -----------------------------------------------------------------------------------


async def test_state_changes_need_the_csrf_header(client: AsyncClient) -> None:
    del client.headers["x-csrf-token"]
    response = await signup(client)
    assert response.status_code == 403
    client.headers["x-csrf-token"] = "wrong"
    assert (await signup(client)).status_code == 403


# --- login and lockout ----------------------------------------------------------------------


async def test_login_errors_do_not_reveal_whether_the_account_exists(client: AsyncClient) -> None:
    await signup(client)
    async with new_client() as other:
        wrong_password = await login(other, password="not the password!")
        no_account = await login(other, email="nobody@example.lv")
    assert wrong_password.status_code == no_account.status_code == 401
    assert wrong_password.json() == no_account.json()


async def test_ten_failed_logins_lock_the_account(client: AsyncClient) -> None:
    await signup(client)
    async with new_client() as attacker:
        for _ in range(10):
            assert (await login(attacker, password="guess guess guess")).status_code in (401, 429)
        # Even the right password is refused while locked.
        assert (await login(attacker)).status_code == 429


async def test_me_needs_a_session(client: AsyncClient) -> None:
    assert (await client.get("/me")).status_code == 401


# --- refresh rotation -----------------------------------------------------------------------


async def test_refresh_rotates_both_tokens(client: AsyncClient) -> None:
    await signup(client)
    old_access = client.cookies["sp_access"]
    old_refresh = client.cookies["sp_refresh"]
    assert (await client.post("/auth/refresh")).status_code == 204
    assert client.cookies["sp_access"] != old_access
    assert client.cookies["sp_refresh"] != old_refresh
    assert (await client.get("/me")).status_code == 200
    # The replaced access token no longer works.
    client.cookies.set("sp_access", old_access)
    assert (await client.get("/me")).status_code == 401


async def test_reusing_an_old_refresh_token_kills_the_session(client: AsyncClient) -> None:
    await signup(client)
    stolen = client.cookies["sp_refresh"]
    assert (await client.post("/auth/refresh")).status_code == 204
    good_access = client.cookies["sp_access"]

    async with new_client() as thief:
        thief.cookies.set("sp_refresh", stolen)
        assert (await thief.post("/auth/refresh")).status_code == 401

    client.cookies.set("sp_access", good_access)
    assert (await client.get("/me")).status_code == 401


async def test_logout_revokes_the_session(client: AsyncClient) -> None:
    await signup(client)
    access = client.cookies["sp_access"]
    assert (await client.post("/auth/logout")).status_code == 204
    client.cookies.set("sp_access", access)
    assert (await client.get("/me")).status_code == 401


async def test_logout_everywhere_ends_other_devices(client: AsyncClient) -> None:
    await signup(client)
    async with new_client() as laptop:
        await login(laptop)
        assert (await client.post("/auth/logout-everywhere")).status_code == 204
        assert (await laptop.get("/me")).status_code == 401


# --- MFA ------------------------------------------------------------------------------------


async def test_owner_must_enrol_in_mfa_before_real_work(client: AsyncClient) -> None:
    body = (await signup(client, "owner@salon.lv", role="owner")).json()
    assert body["mfa_pending"] is True
    response = await client.post("/auth/logout-everywhere")
    assert response.status_code == 403
    assert response.json()["detail"] == "mfa_required"

    _, codes = await enrol_mfa(client)
    assert len(codes) == 10
    assert (await client.get("/me")).json()["mfa_pending"] is False


async def test_owner_login_requires_a_fresh_code_and_blocks_replay(client: AsyncClient) -> None:
    await signup(client, "owner@salon.lv", role="owner")
    totp, _ = await enrol_mfa(client)
    used_code = totp.now()

    async with new_client() as device:
        body = (await login(device, "owner@salon.lv")).json()
        assert body["mfa_pending"] is True
        # The code already used to enrol cannot be replayed.
        assert (await device.post("/auth/mfa/verify", json={"code": used_code})).status_code == 400
        next_code = totp.at(int(time.time()) + 30)
        verified = await device.post("/auth/mfa/verify", json={"code": next_code})
        assert verified.status_code == 200
        assert verified.json()["mfa_pending"] is False


async def test_recovery_codes_work_once(client: AsyncClient) -> None:
    await signup(client, "owner@salon.lv", role="owner")
    _, codes = await enrol_mfa(client)

    async with new_client() as device:
        await login(device, "owner@salon.lv")
        assert (await device.post("/auth/mfa/verify", json={"code": codes[0]})).status_code == 200
    async with new_client() as device:
        await login(device, "owner@salon.lv")
        assert (await device.post("/auth/mfa/verify", json={"code": codes[0]})).status_code == 400


async def test_mfa_secret_is_encrypted_at_rest(client: AsyncClient) -> None:
    await signup(client, "owner@salon.lv", role="owner")
    secret = (await client.post("/auth/mfa/setup")).json()["secret"]
    async with get_engine().connect() as conn:
        stored = await conn.scalar(text("SELECT mfa_secret_encrypted FROM users"))
    assert secret.encode() not in stored


# --- email verification and password reset ------------------------------------------------


async def test_verify_email_link_works_once(client: AsyncClient) -> None:
    await signup(client)
    token = last_link_token("/verify-email")
    assert (await client.post("/auth/verify-email", json={"token": token})).status_code == 204
    assert (await client.get("/me")).json()["email_verified"] is True
    assert (await client.post("/auth/verify-email", json={"token": token})).status_code == 400


async def test_reset_request_looks_the_same_for_unknown_emails(client: AsyncClient) -> None:
    response = await client.post("/auth/password-reset", json={"email": "nobody@example.lv"})
    assert response.status_code == 202
    assert mail.outbox == []


async def test_password_reset_changes_password_and_ends_sessions(client: AsyncClient) -> None:
    await signup(client)
    await client.post("/auth/password-reset", json={"email": "ana@example.lv"})
    token = last_link_token("/reset-password")
    new_password = "a brand new passphrase"

    async with new_client() as other:
        confirm = await other.post(
            "/auth/password-reset/confirm", json={"token": token, "password": new_password}
        )
        assert confirm.status_code == 204
        again = await other.post(
            "/auth/password-reset/confirm", json={"token": token, "password": new_password}
        )
        assert again.status_code == 400
        assert (await login(other)).status_code == 401
        assert (await login(other, password=new_password)).status_code == 200

    assert (await client.get("/me")).status_code == 401


async def test_reset_requests_are_rate_limited_per_email(client: AsyncClient) -> None:
    for _ in range(3):
        await client.post("/auth/password-reset", json={"email": "ana@example.lv"})
    response = await client.post("/auth/password-reset", json={"email": "ana@example.lv"})
    assert response.status_code == 429


# --- audit log ------------------------------------------------------------------------------


async def test_audit_log_is_append_only(client: AsyncClient) -> None:
    await signup(client)
    async with get_engine().connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM audit_log")) == 1
        with pytest.raises(DBAPIError, match="append-only"):
            await conn.execute(text("UPDATE audit_log SET action_type = 'x'"))
        await conn.rollback()
        with pytest.raises(DBAPIError, match="append-only"):
            await conn.execute(text("DELETE FROM audit_log"))
