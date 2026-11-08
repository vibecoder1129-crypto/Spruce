"""Slice 3: services, team and permissions (LLD 3.1, 3.2, 4.4, 5.3; HLD 4.6, 9)."""

import re

from httpx import AsyncClient
from sqlalchemy import text

from app import email as mail
from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import PASSWORD, login, onboarded, owner, platform_admin, signup

SERVICE = {"name": "Haircut", "category": "hair", "duration_minutes": 45, "price_minor": 3500}
GRANTABLE = [
    "calendar.view",
    "calendar.team",
    "appointments.own",
    "checkout.own",
    "reports.own",
    "chat.personal",
]


async def first_staff(client: AsyncClient, business_id: str) -> str:
    staff: str = (await client.get(f"/businesses/{business_id}/staff")).json()[0]["id"]
    return staff


def invite_token() -> str:
    match = re.search(r"/invite/([\w-]+)", mail.outbox[-1].text)
    assert match, mail.outbox[-1].text
    return match.group(1)


async def invite(client: AsyncClient, staff_id: str, email: str = "marta@example.lv") -> str:
    response = await client.post(f"/staff/{staff_id}/invite", json={"email": email})
    assert response.status_code == 202, response.text
    return invite_token()


async def accept(staff: AsyncClient, token: str) -> None:
    response = await staff.post(
        f"/invites/{token}/accept", json={"password": PASSWORD, "accept_terms": True}
    )
    assert response.status_code == 201, response.text


async def team(client: AsyncClient) -> tuple[str, str]:
    """An owner with a business and one staff member. Returns (business_id, staff_id)."""
    await owner(client)
    business_id = await onboarded(client, submit=False)
    return business_id, await first_staff(client, business_id)


# --- services --------------------------------------------------------------------------------


async def test_owner_adds_a_service_priced_in_the_local_currency(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    response = await client.post(f"/businesses/{business_id}/services", json=SERVICE)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["currency"] == "EUR"
    assert body["price_minor"] == 3500
    assert body["active"] is True
    listed = (await client.get(f"/businesses/{business_id}/services")).json()
    assert [s["id"] for s in listed] == [body["id"]]


async def test_currency_cannot_be_set_by_the_client(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    response = await client.post(
        f"/businesses/{business_id}/services", json={**SERVICE, "currency": "USD"}
    )
    assert response.status_code == 422


async def test_service_needs_a_location_first(client: AsyncClient) -> None:
    await owner(client)
    business = await client.post("/businesses", json={"name": "Linden", "category": "hair"})
    response = await client.post(f"/businesses/{business.json()['id']}/services", json=SERVICE)
    assert response.status_code == 409


async def test_service_duration_and_price_are_checked(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    path = f"/businesses/{business_id}/services"
    for bad in (
        {"duration_minutes": 47},
        {"duration_minutes": 0},
        {"duration_minutes": 485},
        {"price_minor": -1},
        {"price_minor": 12.5},
        {"category": "casino"},
        {"name": ""},
    ):
        assert (await client.post(path, json={**SERVICE, **bad})).status_code == 422, bad


async def test_owner_edits_and_archives_a_service(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    path = f"/businesses/{business_id}/services"
    old = (await client.post(path, json=SERVICE)).json()
    new = (await client.post(path, json={**SERVICE, "name": "Colour"})).json()
    response = await client.patch(
        f"/services/{old['id']}", json={"price_minor": 4000, "active": False}
    )
    assert response.status_code == 200
    assert response.json()["price_minor"] == 4000
    listed = (await client.get(path)).json()
    assert [(s["id"], s["active"]) for s in listed] == [(new["id"], True), (old["id"], False)]


async def test_another_owners_services_are_404(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    service = (await client.post(f"/businesses/{business_id}/services", json=SERVICE)).json()
    async with new_client() as other:
        await owner(other, "other@example.lv")
        assert (await other.get(f"/businesses/{business_id}/services")).status_code == 404
        created = await other.post(f"/businesses/{business_id}/services", json=SERVICE)
        assert created.status_code == 404
        patched = await other.patch(f"/services/{service['id']}", json={"price_minor": 1})
        assert patched.status_code == 404


async def test_services_need_an_owner(client: AsyncClient) -> None:
    business_id, _ = await team(client)
    async with new_client() as anonymous:
        assert (await anonymous.get(f"/businesses/{business_id}/services")).status_code == 401
    async with new_client() as consumer:
        await signup(consumer, "ana@example.lv")
        assert (await consumer.get(f"/businesses/{business_id}/services")).status_code == 403


# --- staff edits and service assignment ------------------------------------------------------


async def test_owner_edits_a_staff_member(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    response = await client.patch(f"/staff/{staff_id}", json={"title": "Senior stylist"})
    assert response.status_code == 200
    assert response.json()["title"] == "Senior stylist"


async def test_staff_location_must_stay_in_the_business(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    async with new_client() as other:
        await owner(other, "other@example.lv")
        other_id = await onboarded(other, submit=False)
        elsewhere = (await other.get(f"/businesses/{other_id}/locations")).json()[0]["id"]
    response = await client.patch(f"/staff/{staff_id}", json={"location_id": elsewhere})
    assert response.status_code == 404


async def test_owner_assigns_services_to_a_staff_member(client: AsyncClient) -> None:
    business_id, staff_id = await team(client)
    path = f"/businesses/{business_id}/services"
    cut = (await client.post(path, json=SERVICE)).json()["id"]
    colour = (await client.post(path, json={**SERVICE, "name": "Colour"})).json()["id"]
    response = await client.put(f"/staff/{staff_id}/services", json={"service_ids": [cut, colour]})
    assert response.status_code == 200
    assert sorted(response.json()["service_ids"]) == sorted([cut, colour])
    await client.put(f"/staff/{staff_id}/services", json={"service_ids": [colour]})
    staff = (await client.get(f"/businesses/{business_id}/staff")).json()[0]
    assert staff["service_ids"] == [colour]


async def test_cannot_assign_another_business_service(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    async with new_client() as other:
        await owner(other, "other@example.lv")
        other_id = await onboarded(other, submit=False)
        foreign = (await other.post(f"/businesses/{other_id}/services", json=SERVICE)).json()
    response = await client.put(
        f"/staff/{staff_id}/services", json={"service_ids": [foreign["id"]]}
    )
    assert response.status_code == 404


async def test_another_owners_staff_is_404(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    async with new_client() as other:
        await owner(other, "other@example.lv")
        assert (await other.patch(f"/staff/{staff_id}", json={"title": "x"})).status_code == 404
        put = await other.put(f"/staff/{staff_id}/services", json={"service_ids": []})
        assert put.status_code == 404
        assert (await other.get(f"/staff/{staff_id}/permissions")).status_code == 404
        flag = await other.put(
            f"/staff/{staff_id}/permissions/calendar.view", json={"granted": True}
        )
        assert flag.status_code == 404
        invited = await other.post(f"/staff/{staff_id}/invite", json={"email": "x@example.lv"})
        assert invited.status_code == 404


# --- permissions -----------------------------------------------------------------------------


async def test_every_flag_starts_off(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    response = await client.get(f"/staff/{staff_id}/permissions")
    assert response.status_code == 200
    assert response.json() == [{"flag": f, "granted": False} for f in GRANTABLE]


async def test_owner_grants_one_flag_and_granting_twice_is_harmless(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    path = f"/staff/{staff_id}/permissions/calendar.view"
    assert (await client.put(path, json={"granted": True})).status_code == 200
    assert (await client.put(path, json={"granted": True})).status_code == 200
    flags = {
        p["flag"]: p["granted"] for p in (await client.get(f"/staff/{staff_id}/permissions")).json()
    }
    assert flags == {f: f == "calendar.view" for f in GRANTABLE}
    async with get_engine().connect() as conn:
        rows = await conn.scalar(text("SELECT count(*) FROM permission_grants"))
        action = await conn.scalar(
            text("SELECT action_type FROM audit_log ORDER BY created_at DESC LIMIT 1")
        )
    assert rows == 1
    assert action == "permission.grant"


async def test_never_grantable_flags_cannot_be_granted(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    for flag in ("permissions.manage", "business.settings", "chat.business", "shift.manage", "x"):
        response = await client.put(f"/staff/{staff_id}/permissions/{flag}", json={"granted": True})
        assert response.status_code == 404, flag
    async with get_engine().connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM permission_grants")) == 0


async def test_platform_admins_cannot_set_permissions(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    async with new_client() as admin:
        await platform_admin(admin)
        response = await admin.put(
            f"/staff/{staff_id}/permissions/calendar.view", json={"granted": True}
        )
    assert response.status_code == 403


async def test_revoking_a_flag_signs_the_staff_member_out(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    token = await invite(client, staff_id)
    path = f"/staff/{staff_id}/permissions/calendar.view"
    await client.put(path, json={"granted": True})
    async with new_client() as staff:
        await accept(staff, token)
        me = (await staff.get("/me/staff")).json()
        assert me["permissions"] == ["calendar.view"]
        assert (await client.put(path, json={"granted": False})).status_code == 200
        assert (await staff.get("/me/staff")).status_code == 401
    async with get_engine().connect() as conn:
        revoked = await conn.scalar(
            text("SELECT count(*) FROM permission_grants WHERE revoked_at IS NOT NULL")
        )
        action = await conn.scalar(
            text("SELECT action_type FROM audit_log ORDER BY created_at DESC LIMIT 1")
        )
    assert revoked == 1
    assert action == "permission.revoke"


async def test_a_later_login_also_loses_its_session_on_revoke(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    token = await invite(client, staff_id)
    path = f"/staff/{staff_id}/permissions/reports.own"
    await client.put(path, json={"granted": True})
    async with new_client() as first:
        await accept(first, token)
    async with new_client() as staff:
        assert (await login(staff, "marta@example.lv")).status_code == 200
        assert (await staff.get("/me/staff")).status_code == 200
        await client.put(path, json={"granted": False})
        assert (await staff.get("/me/staff")).status_code == 401


async def test_regranting_after_a_revoke_keeps_the_history(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    path = f"/staff/{staff_id}/permissions/chat.personal"
    for granted in (True, False, True):
        assert (await client.put(path, json={"granted": granted})).status_code == 200
    async with get_engine().connect() as conn:
        assert await conn.scalar(text("SELECT count(*) FROM permission_grants")) == 2


# --- invites ---------------------------------------------------------------------------------


async def test_staff_member_accepts_an_invite(client: AsyncClient) -> None:
    business_id, staff_id = await team(client)
    token = await invite(client, staff_id)
    assert "marta@example.lv" not in str(mail.outbox[-1].subject)
    async with new_client() as staff:
        preview = await staff.get(f"/invites/{token}")
        assert preview.status_code == 200
        assert preview.json() == {"business_name": "Linden Studio", "display_name": "Marta"}
        await accept(staff, token)
        me = await staff.get("/me/staff")
        assert me.status_code == 200
        assert me.json()["business_name"] == "Linden Studio"
        assert me.json()["display_name"] == "Marta"
        assert (await staff.get("/me")).json()["role"] == "staff"
        again = await staff.post(
            f"/invites/{token}/accept", json={"password": PASSWORD, "accept_terms": True}
        )
        assert again.status_code == 404
    listed = (await client.get(f"/businesses/{business_id}/staff")).json()[0]
    assert listed["has_login"] is True
    assert (
        await client.post(f"/staff/{staff_id}/invite", json={"email": "m2@example.lv"})
    ).status_code == 409


async def test_a_new_invite_voids_the_old_one(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    first = await invite(client, staff_id)
    second = await invite(client, staff_id, "marta.k@example.lv")
    async with new_client() as staff:
        assert (await staff.get(f"/invites/{first}")).status_code == 404
        assert (await staff.get(f"/invites/{second}")).status_code == 200


async def test_invite_email_must_be_new(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    response = await client.post(f"/staff/{staff_id}/invite", json={"email": "owner@example.lv"})
    assert response.status_code == 409


async def test_accepting_needs_terms_and_a_real_token(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    token = await invite(client, staff_id)
    async with new_client() as staff:
        no_terms = await staff.post(f"/invites/{token}/accept", json={"password": PASSWORD})
        assert no_terms.status_code == 422
        assert (await staff.get("/invites/not-a-real-token")).status_code == 404


async def test_invite_email_is_stored_encrypted(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    await invite(client, staff_id)
    async with get_engine().connect() as conn:
        dump = await conn.scalar(text("SELECT row_to_json(i)::text FROM staff_invites i"))
    assert dump is not None and "marta@example.lv" not in dump


# --- the staff member's own page -------------------------------------------------------------


async def test_staff_edit_only_their_own_name_and_title(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    token = await invite(client, staff_id)
    async with new_client() as staff:
        await accept(staff, token)
        renamed = await staff.patch("/me/staff", json={"display_name": "Marta K."})
        assert renamed.status_code == 200
        assert renamed.json()["display_name"] == "Marta K."
        moved = await staff.patch("/me/staff", json={"location_id": staff_id})
        assert moved.status_code == 422


async def test_staff_cannot_use_owner_endpoints_even_with_every_flag(client: AsyncClient) -> None:
    business_id, staff_id = await team(client)
    for flag in GRANTABLE:
        await client.put(f"/staff/{staff_id}/permissions/{flag}", json={"granted": True})
    token = await invite(client, staff_id)
    async with new_client() as staff:
        await accept(staff, token)
        assert (await staff.get(f"/businesses/{business_id}/services")).status_code == 403
        assert (await staff.get(f"/businesses/{business_id}/staff")).status_code == 403
        assert (await staff.patch(f"/staff/{staff_id}", json={"title": "Boss"})).status_code == 403
        grant = await staff.put(
            f"/staff/{staff_id}/permissions/calendar.team", json={"granted": True}
        )
        assert grant.status_code == 403
        assert (
            await staff.post("/businesses", json={"name": "X", "category": "hair"})
        ).status_code == 403


async def test_only_staff_have_a_staff_page(client: AsyncClient) -> None:
    await team(client)
    assert (await client.get("/me/staff")).status_code == 403
    async with new_client() as anonymous:
        assert (await anonymous.get("/me/staff")).status_code == 401


async def test_archiving_a_staff_member_signs_them_out(client: AsyncClient) -> None:
    _, staff_id = await team(client)
    token = await invite(client, staff_id)
    async with new_client() as staff:
        await accept(staff, token)
        assert (await client.patch(f"/staff/{staff_id}", json={"active": False})).status_code == 200
        assert (await staff.get("/me/staff")).status_code == 401
        assert (await login(staff, "marta@example.lv")).status_code == 200
        assert (await staff.get("/me/staff")).status_code == 403
