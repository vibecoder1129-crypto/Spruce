"""Slice 8: admin support mode (owner-approved, audited)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import onboarded, owner, platform_admin
from tests.test_marketplace import sql
from tests.test_team import SERVICE


async def business(client: AsyncClient) -> str:
    await owner(client)
    return await onboarded(client)


@asynccontextmanager
async def admin() -> AsyncIterator[AsyncClient]:
    async with new_client() as a:
        await platform_admin(a)
        yield a


async def allow(client: AsyncClient, business_id: str, hours: int = 24) -> None:
    response = await client.put(f"/businesses/{business_id}/support", json={"hours": hours})
    assert response.status_code == 200, response.text


async def test_support_needs_the_owners_permission_and_is_logged(client: AsyncClient) -> None:
    business_id = await business(client)
    async with admin() as a:
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code == 409
        await allow(client, business_id)
        state = (await client.get(f"/businesses/{business_id}/support")).json()
        assert state["until"] is not None and state["log"] == []

        started = await a.post(f"/admin/businesses/{business_id}/support")
        assert started.status_code == 200, started.text
        me = (await a.get("/me")).json()
        assert me["role"] == "owner" and me["support"] is True
        # The admin works as the owner: adds a service.
        service = await a.post(
            f"/businesses/{business_id}/services",
            json=SERVICE,
        )
        assert service.status_code == 201, service.text

    log = (await client.get(f"/businesses/{business_id}/support")).json()["log"]
    assert [(e["method"], e["path"], e["by"]) for e in log] == [
        ("POST", f"/businesses/{business_id}/services", "admin@example.com")
    ]
    assert (await client.get("/me")).json()["support"] is False


async def test_turning_access_off_ends_support_at_once(client: AsyncClient) -> None:
    business_id = await business(client)
    await allow(client, business_id, 72)
    async with admin() as a:
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code == 200
        assert (await a.get(f"/businesses/{business_id}/locations")).status_code == 200
        await allow(client, business_id, 0)
        assert (await client.get(f"/businesses/{business_id}/support")).json()["until"] is None
        assert (await a.get(f"/businesses/{business_id}/locations")).status_code == 401


async def test_expired_access_ends_support(client: AsyncClient) -> None:
    business_id = await business(client)
    await allow(client, business_id)
    async with admin() as a:
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code == 200
        await sql(
            "UPDATE businesses SET support_until = now() - interval '1 minute' WHERE id = :id",
            id=business_id,
        )
        assert (await a.get(f"/businesses/{business_id}/locations")).status_code == 401
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code in (401, 409)


async def test_support_cant_touch_the_owners_account_or_the_setting(client: AsyncClient) -> None:
    business_id = await business(client)
    await allow(client, business_id)
    async with admin() as a:
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code == 200
        assert (await a.post("/auth/mfa/setup")).status_code == 403
        assert (await a.post("/auth/logout-everywhere")).status_code == 403
        assert (
            await a.put(f"/businesses/{business_id}/support", json={"hours": 72})
        ).status_code == 403
        assert (await a.get(f"/businesses/{business_id}/support")).status_code == 403
        # Ending support is allowed and logs out.
        assert (await a.post("/auth/logout")).status_code == 204
        assert (await a.get("/me")).status_code == 401


async def test_who_may_allow_and_start(client: AsyncClient) -> None:
    business_id = await business(client)
    async with new_client() as visitor:
        assert (
            await visitor.put(f"/businesses/{business_id}/support", json={"hours": 24})
        ).status_code == 401
        assert (await visitor.post(f"/admin/businesses/{business_id}/support")).status_code == 401
    # Only 0, 24 or 72 hours.
    assert (
        await client.put(f"/businesses/{business_id}/support", json={"hours": 5})
    ).status_code == 422
    # Owners can't start support; another owner can't allow it for this business.
    assert (await client.post(f"/admin/businesses/{business_id}/support")).status_code == 403
    async with new_client() as other:
        await owner(other, "other@example.lv")
        assert (
            await other.put(f"/businesses/{business_id}/support", json={"hours": 24})
        ).status_code == 404
        assert (await other.get(f"/businesses/{business_id}/support")).status_code == 404
    async with admin() as a:
        assert (
            await a.put(f"/businesses/{business_id}/support", json={"hours": 24})
        ).status_code == 403
        missing = "00000000-0000-0000-0000-000000000000"
        assert (await a.post(f"/admin/businesses/{missing}/support")).status_code == 404


async def test_support_sessions_last_an_hour_at_most(client: AsyncClient) -> None:
    business_id = await business(client)
    await allow(client, business_id, 72)
    async with admin() as a:
        assert (await a.post(f"/admin/businesses/{business_id}/support")).status_code == 200
    async with get_engine().connect() as conn:
        minutes = (
            await conn.execute(
                text(
                    "SELECT extract(epoch FROM expires_at - created_at) / 60 FROM sessions"
                    " WHERE support_admin_id IS NOT NULL"
                )
            )
        ).scalar_one()
        assert 59 <= minutes <= 61
        audit = (
            await conn.execute(
                text(
                    "SELECT action_type, metadata_json::text FROM audit_log"
                    " WHERE action_type LIKE 'support.%'"
                )
            )
        ).all()
        actions = {row[0] for row in audit}
        assert {"support.allow", "support.start"} <= actions
        assert not any("owner@example.lv" in row[1] for row in audit)
