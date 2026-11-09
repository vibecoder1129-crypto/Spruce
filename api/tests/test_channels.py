"""Slice 10: where online bookings came from (the venue's website, Instagram, Google, Facebook)."""

from httpx import AsyncClient

from tests.conftest import new_client
from tests.test_booking import DAY, booked, customer, request, venue
from tests.test_calendar import staff_login
from tests.test_marketplace import sql


def counts(client_json: list[dict[str, object]]) -> dict[object, object]:
    return {row["channel"]: row["bookings"] for row in client_json}


async def test_bookings_remember_where_they_came_from(client: AsyncClient) -> None:
    ids = await venue(client)
    url = f"/businesses/{ids['business']}/channels"
    assert (await client.get(url)).json() == []
    async with customer() as ana, customer("ilze@example.lv") as ilze:
        first = await booked(ana, ids, time="10:00", channel="instagram")
        await booked(ilze, ids, time="11:00", channel="instagram")
        await booked(ana, ids, time="12:00", channel="website")
        await booked(ilze, ids, time="13:00")  # found on Spruce
        # Cancelled bookings still count: the link did its job.
        assert (await ana.patch(f"/bookings/{first['id']}/cancel")).status_code == 200
        await booked(ana, ids, time="14:00", channel="link")  # shared by message or card
        bad = await ana.post("/bookings", json=request(ids, time="15:00", channel="tiktok"))
        assert bad.status_code == 422
    # Walk-ins are not online bookings.
    walk_in = {
        "staff_id": ids["staff"],
        "service_id": ids["service"],
        "start": f"{DAY}T16:00",
        "guest": {"name": "Liga"},
    }
    made = await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in)
    assert made.status_code == 201, made.text

    response = await client.get(url)
    assert response.status_code == 200, response.text
    assert counts(response.json()) == {"instagram": 2, "website": 1, "link": 1, None: 1}
    # Most first.
    assert response.json()[0]["channel"] == "instagram"


async def test_only_the_last_30_days_and_only_this_venue(client: AsyncClient) -> None:
    ids = await venue(client)
    async with new_client() as other_owner:
        other = await venue(other_owner, email="other@example.lv")
        async with customer() as ana:
            old = await booked(ana, ids, time="10:00", channel="google")
            await booked(ana, ids, time="11:00", channel="facebook")
            await booked(ana, other, time="12:00", channel="google")
        await sql(
            "UPDATE bookings SET created_at = now() - interval '31 days' WHERE id = :id",
            id=old["id"],
        )
        assert counts((await client.get(f"/businesses/{ids['business']}/channels")).json()) == {
            "facebook": 1
        }
        # Another owner's business is a 404.
        assert (await other_owner.get(f"/businesses/{ids['business']}/channels")).status_code == 404


async def test_who_may_see_the_counts(client: AsyncClient) -> None:
    ids = await venue(client)
    url = f"/businesses/{ids['business']}/channels"
    async with new_client() as visitor:
        assert (await visitor.get(url)).status_code == 401
    async with customer() as ana:
        assert (await ana.get(url)).status_code == 403
    async with staff_login(client, ids["staff"]) as marta:
        assert (await marta.get(url)).status_code == 403
