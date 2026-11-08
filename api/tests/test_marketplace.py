"""Slice 5a: marketplace search, storefront and favourites (LLD 4.2; HLD 4.1, 4.2)."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import onboarded, owner, platform_admin, signup
from tests.test_team import SERVICE, first_staff

RIGA = {"lat": 56.9496, "lng": 24.1052}
TALLINN = (59.4370, 24.7536)  # about 280 km from Riga


async def sql(statement: str, **params: object) -> None:
    async with get_engine().begin() as conn:
        await conn.execute(text(statement), params)


async def venue(
    client: AsyncClient,
    email: str = "owner@example.lv",
    *,
    name: str = "Linden Studio",
    status: str = "approved",
    service: bool = True,
) -> str:
    """An owner's business with one location in Riga, one staff member and one service."""
    await owner(client, email)
    business_id = await onboarded(client)
    await client.patch(f"/businesses/{business_id}", json={"name": name})
    if service:
        created = await client.post(f"/businesses/{business_id}/services", json=SERVICE)
        staff_id = await first_staff(client, business_id)
        await client.put(
            f"/staff/{staff_id}/services", json={"service_ids": [created.json()["id"]]}
        )
    if status == "rejected":
        await sql(
            "UPDATE businesses SET approval_status = 'rejected', rejection_reason = 'other' "
            "WHERE id = :id",
            id=business_id,
        )
    else:
        await sql(
            "UPDATE businesses SET approval_status = :s WHERE id = :id", s=status, id=business_id
        )
    return business_id


async def move_to(business_id: str, lat: float, lng: float, city: str, country: str) -> None:
    await sql(
        "UPDATE locations SET latitude = :lat, longitude = :lng, city = :city, "
        "country_code = :country WHERE business_id = :id",
        lat=lat,
        lng=lng,
        city=city,
        country=country,
        id=business_id,
    )


async def search(client: AsyncClient, **params: str | int | float) -> list[dict[str, object]]:
    response = await client.get("/marketplace/search", params=params)
    assert response.status_code == 200, response.text
    results: list[dict[str, object]] = response.json()["results"]
    return results


# --- search ----------------------------------------------------------------------------------


async def test_an_approved_venue_is_found_near_you_with_its_distance(client: AsyncClient) -> None:
    business_id = await venue(client)
    async with new_client() as visitor:
        [found] = await search(visitor, **RIGA, radius_km=10)
    assert found["business_id"] == business_id
    assert found["business_name"] == "Linden Studio"
    assert found["city"] == "Riga"
    assert isinstance(found["distance_km"], float) and found["distance_km"] < 2
    assert found["from_price_minor"] == 3500
    assert found["currency"] == "EUR"


async def test_radius_leaves_out_venues_further_away(client: AsyncClient) -> None:
    near = await venue(client)
    async with new_client() as other:
        far = await venue(other, "other@example.ee", name="Tallinn Nails")
    await move_to(far, *TALLINN, "Tallinn", "EE")
    async with new_client() as visitor:
        assert [r["business_id"] for r in await search(visitor, **RIGA, radius_km=60)] == [near]
        everyone = await search(visitor, **RIGA, radius_km=60, page=0)
        assert len(everyone) == 1
        # Without a point there is no radius: everything listed, sorted by name.
        named = await search(visitor)
        assert [r["business_name"] for r in named] == ["Linden Studio", "Tallinn Nails"]
        assert named[0]["distance_km"] is None


async def test_results_are_sorted_nearest_first(client: AsyncClient) -> None:
    first = await venue(client)
    async with new_client() as other:
        second = await venue(other, "other@example.lv", name="Aaa Barbers")
    await move_to(first, 56.95, 24.11, "Riga", "LV")
    await move_to(second, 56.99, 24.20, "Riga", "LV")
    async with new_client() as visitor:
        found = await search(visitor, lat=56.95, lng=24.11, radius_km=25)
    assert [r["business_id"] for r in found] == [first, second]


async def test_only_the_four_radius_values_are_accepted(client: AsyncClient) -> None:
    for bad in ({**RIGA, "radius_km": 5}, {**RIGA, "radius_km": 100}, {"lat": 56.9}):
        response = await client.get("/marketplace/search", params=bad)
        assert response.status_code == 422, bad


async def test_search_by_city_country_category_and_name(client: AsyncClient) -> None:
    riga = await venue(client)
    async with new_client() as other:
        tallinn = await venue(other, "other@example.ee", name="Tallinn Nails")
    await move_to(tallinn, *TALLINN, "Tallinn", "EE")
    async with new_client() as visitor:
        assert [r["business_id"] for r in await search(visitor, city="riga")] == [riga]
        assert [r["business_id"] for r in await search(visitor, country="EE")] == [tallinn]
        assert [r["business_id"] for r in await search(visitor, q="nails")] == [tallinn]
        # A service name matches too.
        assert len(await search(visitor, q="haircut")) == 2
        assert await search(visitor, category="massage") == []
        cities = (await visitor.get("/marketplace/cities")).json()
    assert {"country_code": "EE", "city": "Tallinn", "count": 1} in cities
    assert {"country_code": "LV", "city": "Riga", "count": 1} in cities


async def test_unapproved_or_empty_venues_are_never_listed(client: AsyncClient) -> None:
    hidden = []
    for i, status in enumerate(("pending", "rejected", "suspended")):
        async with new_client() as other:
            hidden.append(await venue(other, f"o{i}@example.lv", name=status, status=status))
    async with new_client() as other:
        hidden.append(await venue(other, "empty@example.lv", name="Empty", service=False))
    async with new_client() as visitor:
        assert await search(visitor) == []
        assert (await visitor.get("/marketplace/cities")).json() == []
        for business_id in hidden:
            response = await visitor.get(f"/marketplace/businesses/{business_id}")
            assert response.status_code == 404


# --- storefront ------------------------------------------------------------------------------


async def test_storefront_shows_services_team_and_this_weeks_hours(client: AsyncClient) -> None:
    business_id = await venue(client)
    staff_id = await first_staff(client, business_id)
    today = datetime.now(ZoneInfo("Europe/Riga")).date()
    monday = today - timedelta(days=today.weekday())
    shifts = [
        {"staff_id": staff_id, "day": 0, "starts": "10:00", "ends": "18:00"},
        {"staff_id": staff_id, "day": 5, "starts": "09:00", "ends": "14:00"},
    ]
    saved = await client.put(
        f"/businesses/{business_id}/shifts?week={monday}", json={"shifts": shifts}
    )
    assert saved.status_code == 200
    async with new_client() as visitor:
        response = await visitor.get(f"/marketplace/businesses/{business_id}")
    assert response.status_code == 200
    store = response.json()
    assert store["name"] == "Linden Studio"
    assert [s["name"] for s in store["services"]] == ["Haircut"]
    assert store["services"][0]["price_minor"] == 3500
    assert store["team"] == [{"id": staff_id, "display_name": "Marta", "title": "Stylist"}]
    [place] = store["locations"]
    assert place["timezone"] == "Europe/Riga"
    hours = place["hours"]
    assert len(hours) == 7
    assert hours[0] == {"day": 0, "opens": "10:00", "closes": "18:00"}
    assert hours[1] == {"day": 1, "opens": None, "closes": None}
    assert hours[5] == {"day": 5, "opens": "09:00", "closes": "14:00"}


async def test_archived_services_and_staff_stay_off_the_storefront(client: AsyncClient) -> None:
    business_id = await venue(client)
    service_id = (await client.get(f"/businesses/{business_id}/services")).json()[0]["id"]
    staff_id = await first_staff(client, business_id)
    await client.patch(f"/staff/{staff_id}", json={"active": False})
    async with new_client() as visitor:
        store = (await visitor.get(f"/marketplace/businesses/{business_id}")).json()
        assert store["team"] == []
        await client.patch(f"/services/{service_id}", json={"active": False})
        # No active service left: the venue isn't listed any more.
        gone = await visitor.get(f"/marketplace/businesses/{business_id}")
        assert gone.status_code == 404


# --- favourites ------------------------------------------------------------------------------


async def test_customer_saves_and_removes_a_favourite(client: AsyncClient) -> None:
    business_id = await venue(client)
    async with new_client() as customer:
        await signup(customer, "ana@example.lv")
        assert (await customer.put(f"/me/favorites/{business_id}")).status_code == 204
        assert (await customer.put(f"/me/favorites/{business_id}")).status_code == 204
        saved = (await customer.get("/me/favorites")).json()
        assert [f["business_id"] for f in saved] == [business_id]
        assert saved[0]["business_name"] == "Linden Studio"
        assert (await customer.delete(f"/me/favorites/{business_id}")).status_code == 204
        assert (await customer.delete(f"/me/favorites/{business_id}")).status_code == 204
        assert (await customer.get("/me/favorites")).json() == []


async def test_a_hidden_business_cannot_be_saved_and_drops_off_favourites(
    client: AsyncClient,
) -> None:
    business_id = await venue(client)
    async with new_client() as other:
        pending = await venue(other, "other@example.lv", name="Pending", status="pending")
    async with new_client() as customer:
        await signup(customer, "ana@example.lv")
        assert (await customer.put(f"/me/favorites/{pending}")).status_code == 404
        await customer.put(f"/me/favorites/{business_id}")
        await sql(
            "UPDATE businesses SET approval_status = 'suspended' WHERE id = :id", id=business_id
        )
        assert (await customer.get("/me/favorites")).json() == []


async def test_favourites_are_for_customers_only(client: AsyncClient) -> None:
    business_id = await venue(client)
    assert (await client.put(f"/me/favorites/{business_id}")).status_code == 403
    async with new_client() as anonymous:
        assert (await anonymous.get("/me/favorites")).status_code == 401
        assert (await anonymous.put(f"/me/favorites/{business_id}")).status_code == 401
    async with new_client() as admin:
        await platform_admin(admin)
        assert (await admin.get("/me/favorites")).status_code == 403
