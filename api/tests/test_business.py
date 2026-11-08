"""Slice 2: business onboarding and platform review (LLD 3.2, 4.8; HLD 4.3, 6)."""

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import LOCATION, onboarded, owner, platform_admin, signup

# --- countries -------------------------------------------------------------------------------


async def test_countries_are_public_and_list_time_zones(client: AsyncClient) -> None:
    response = await client.get("/geo/countries")
    assert response.status_code == 200
    countries = {c["code"]: c for c in response.json()}
    assert countries["LV"]["timezones"] == ["Europe/Riga"]
    assert "Atlantic/Canary" in countries["ES"]["timezones"]
    assert "US" not in countries


# --- creating a business ---------------------------------------------------------------------


async def test_owner_creates_a_pending_business(client: AsyncClient) -> None:
    await owner(client)
    response = await client.post("/businesses", json={"name": "Linden Studio", "category": "hair"})
    assert response.status_code == 201
    body = response.json()
    assert body["approval_status"] == "pending"
    assert body["submitted_at"] is None
    mine = await client.get("/businesses/mine")
    assert mine.status_code == 200
    assert mine.json()["id"] == body["id"]


async def test_mine_is_404_before_onboarding(client: AsyncClient) -> None:
    await owner(client)
    assert (await client.get("/businesses/mine")).status_code == 404


async def test_one_business_per_owner(client: AsyncClient) -> None:
    await owner(client)
    await onboarded(client, submit=False)
    again = await client.post("/businesses", json={"name": "Second", "category": "nails"})
    assert again.status_code == 409


async def test_creating_a_business_needs_login(client: AsyncClient) -> None:
    response = await client.post("/businesses", json={"name": "X", "category": "hair"})
    assert response.status_code == 401


async def test_owner_must_finish_two_step_first(client: AsyncClient) -> None:
    await signup(client, "owner@example.lv", role="owner")
    response = await client.post("/businesses", json={"name": "X", "category": "hair"})
    assert response.status_code == 403
    assert response.json()["detail"] == "mfa_required"


async def test_consumers_cannot_create_a_business(client: AsyncClient) -> None:
    await signup(client)
    response = await client.post("/businesses", json={"name": "X", "category": "hair"})
    assert response.status_code == 403


async def test_status_cannot_be_set_by_the_client(client: AsyncClient) -> None:
    await owner(client)
    response = await client.post(
        "/businesses", json={"name": "X", "category": "hair", "approval_status": "approved"}
    )
    assert response.status_code == 422


async def test_unknown_category_is_rejected(client: AsyncClient) -> None:
    await owner(client)
    response = await client.post("/businesses", json={"name": "X", "category": "casino"})
    assert response.status_code == 422


async def test_owner_renames_their_business(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    response = await client.patch(f"/businesses/{business_id}", json={"name": "Linden & Co"})
    assert response.status_code == 200
    assert response.json()["name"] == "Linden & Co"


# --- locations -------------------------------------------------------------------------------


async def test_location_is_geocoded_on_the_server(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    locations = (await client.get(f"/businesses/{business_id}/locations")).json()
    assert len(locations) == 1
    place = locations[0]
    assert place["address_text"] == "Kalku iela 1, LV-1050 Riga, Latvia"
    assert 56 < place["latitude"] < 58
    assert 23 < place["longitude"] < 25
    assert place["timezone"] == "Europe/Riga"


async def test_location_gets_a_geography_point(client: AsyncClient) -> None:
    await owner(client)
    await onboarded(client, submit=False)
    async with get_engine().connect() as conn:
        srid = await conn.scalar(text("SELECT ST_SRID(geog::geometry) FROM locations"))
        index = await conn.scalar(
            text("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_locations_geog'")
        )
    assert srid == 4326
    assert index is not None and "USING gist (geog)" in index


async def test_client_sent_coordinates_are_rejected(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    response = await client.post(
        f"/businesses/{business_id}/locations",
        json={**LOCATION, "latitude": 1.0, "longitude": 1.0},
    )
    assert response.status_code == 422


async def test_address_that_cannot_be_found_is_422(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    response = await client.post(
        f"/businesses/{business_id}/locations", json={**LOCATION, "street": "Nowhere 0"}
    )
    assert response.status_code == 422
    assert "couldn't find" in response.json()["detail"]


async def test_time_zone_must_belong_to_the_country(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    response = await client.post(
        f"/businesses/{business_id}/locations", json={**LOCATION, "timezone": "Europe/Paris"}
    )
    assert response.status_code == 422


async def test_country_outside_launch_area_is_rejected(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    response = await client.post(
        f"/businesses/{business_id}/locations",
        json={**LOCATION, "country_code": "US", "timezone": "America/New_York"},
    )
    assert response.status_code == 422


# --- staff -----------------------------------------------------------------------------------


async def test_staff_location_must_belong_to_the_business(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    async with new_client() as other:
        await owner(other, "other@example.lv")
        other_id = await onboarded(other, submit=False)
        other_location = (await other.get(f"/businesses/{other_id}/locations")).json()[0]["id"]
    response = await client.post(
        f"/businesses/{business_id}/staff",
        json={"display_name": "Ilze", "title": "", "location_id": other_location},
    )
    assert response.status_code == 404


async def test_staff_list(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    staff = (await client.get(f"/businesses/{business_id}/staff")).json()
    assert [s["display_name"] for s in staff] == ["Marta"]
    assert staff[0]["has_login"] is False


# --- another owner's business ----------------------------------------------------------------


async def test_another_owners_business_is_404_everywhere(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    async with new_client() as other:
        await owner(other, "other@example.lv")
        assert (await other.get(f"/businesses/{business_id}/locations")).status_code == 404
        assert (await other.get(f"/businesses/{business_id}/staff")).status_code == 404
        patch = await other.patch(f"/businesses/{business_id}", json={"name": "Mine now"})
        assert patch.status_code == 404
        location = await other.post(f"/businesses/{business_id}/locations", json=LOCATION)
        assert location.status_code == 404
        assert (await other.post(f"/businesses/{business_id}/submit")).status_code == 404


# --- submitting for review -------------------------------------------------------------------


async def test_submit_needs_a_location_and_a_staff_member(client: AsyncClient) -> None:
    await owner(client)
    business = await client.post("/businesses", json={"name": "Linden", "category": "hair"})
    response = await client.post(f"/businesses/{business.json()['id']}/submit")
    assert response.status_code == 409


async def test_submit_marks_the_business_for_review(client: AsyncClient) -> None:
    await owner(client)
    await onboarded(client)
    mine = (await client.get("/businesses/mine")).json()
    assert mine["approval_status"] == "pending"
    assert mine["submitted_at"] is not None


# --- platform admin --------------------------------------------------------------------------


async def test_admin_sees_submitted_businesses_only(client: AsyncClient) -> None:
    await owner(client)
    submitted = await onboarded(client)
    async with new_client() as draft_owner:
        await owner(draft_owner, "draft@example.lv")
        await onboarded(draft_owner, submit=False)
    async with new_client() as admin:
        await platform_admin(admin)
        queue = (await admin.get("/admin/businesses?status=pending")).json()
    assert [b["id"] for b in queue] == [submitted]
    assert queue[0]["location_count"] == 1


async def test_admin_approves(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client)
    async with new_client() as admin:
        await platform_admin(admin)
        response = await admin.patch(f"/admin/businesses/{business_id}/approve")
        assert response.status_code == 200
        assert (await admin.patch(f"/admin/businesses/{business_id}/approve")).status_code == 409
    assert (await client.get("/businesses/mine")).json()["approval_status"] == "approved"
    async with get_engine().connect() as conn:
        action = await conn.scalar(
            text(
                "SELECT action_type FROM audit_log WHERE target_id = :id ORDER BY created_at DESC"
            ),
            {"id": business_id},
        )
    assert action == "business.approve"


async def test_admin_rejects_with_a_reason_and_owner_resubmits(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client)
    async with new_client() as admin:
        await platform_admin(admin)
        response = await admin.patch(
            f"/admin/businesses/{business_id}/reject", json={"reason": "incomplete_profile"}
        )
        assert response.status_code == 200
    mine = (await client.get("/businesses/mine")).json()
    assert mine["approval_status"] == "rejected"
    assert mine["rejection_reason"] == "incomplete_profile"
    resubmit = await client.post(f"/businesses/{business_id}/submit")
    assert resubmit.status_code == 200
    assert resubmit.json()["approval_status"] == "pending"
    assert resubmit.json()["rejection_reason"] is None


async def test_reject_other_needs_a_note(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client)
    async with new_client() as admin:
        await platform_admin(admin)
        bare = await admin.patch(
            f"/admin/businesses/{business_id}/reject", json={"reason": "other"}
        )
        assert bare.status_code == 422
        noted = await admin.patch(
            f"/admin/businesses/{business_id}/reject",
            json={"reason": "other", "note": "Photos show a different venue."},
        )
        assert noted.status_code == 200


async def test_cannot_approve_a_business_still_onboarding(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client, submit=False)
    async with new_client() as admin:
        await platform_admin(admin)
        assert (await admin.patch(f"/admin/businesses/{business_id}/approve")).status_code == 409


async def test_owners_cannot_use_admin_endpoints(client: AsyncClient) -> None:
    await owner(client)
    business_id = await onboarded(client)
    assert (await client.get("/admin/businesses")).status_code == 403
    assert (await client.patch(f"/admin/businesses/{business_id}/approve")).status_code == 403


async def test_admin_endpoints_need_login(client: AsyncClient) -> None:
    assert (await client.get("/admin/businesses")).status_code == 401
