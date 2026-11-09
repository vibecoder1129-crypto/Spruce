"""Slice 12: rooms and equipment. A service can need one of a set of rooms or machines."""

from typing import Any

from httpx import AsyncClient

from tests.conftest import new_client
from tests.helpers import LOCATION
from tests.test_booking import (
    DAY,
    TUESDAY_9_TO_5,
    WEEK,
    booked,
    customer,
    open_times,
    request,
    venue,
)
from tests.test_calendar import other_team, staff_login


def walk_in(ids: dict[str, str], start: str = f"{DAY}T10:00") -> dict[str, Any]:
    return {
        "staff_id": ids["staff"],
        "service_id": ids["service"],
        "start": start,
        "guest": {"name": "Liga Ozola"},
    }


async def second_staff(client: AsyncClient, ids: dict[str, str], name: str = "Ilze") -> str:
    """Another person at the same location, doing the same service on the same Tuesday."""
    made = await client.post(
        f"/businesses/{ids['business']}/staff",
        json={
            "display_name": name,
            "title": "Therapist",
            "location_id": await location(client, ids),
        },
    )
    added: str = made.json()["id"]
    await client.put(f"/staff/{added}/services", json={"service_ids": [ids["service"]]})
    everyone = (await client.get(f"/businesses/{ids['business']}/staff")).json()
    shifts = [{"staff_id": s["id"], **TUESDAY_9_TO_5} for s in everyone]
    response = await client.put(
        f"/businesses/{ids['business']}/shifts?week={WEEK}", json={"shifts": shifts}
    )
    assert response.status_code == 200, response.text
    return added


async def location(client: AsyncClient, ids: dict[str, str]) -> str:
    places = (await client.get(f"/businesses/{ids['business']}/locations")).json()
    return str(places[0]["id"])


async def room(
    client: AsyncClient, ids: dict[str, str], name: str = "Laser room"
) -> dict[str, Any]:
    made = await client.post(
        f"/businesses/{ids['business']}/resources",
        json={"name": name, "location_id": await location(client, ids)},
    )
    assert made.status_code == 201, made.text
    linked = await client.patch(
        f"/resources/{made.json()['id']}", json={"service_ids": [ids["service"]]}
    )
    assert linked.status_code == 200, linked.text
    body: dict[str, Any] = linked.json()
    return body


async def test_an_owner_adds_a_room_for_a_service(client: AsyncClient) -> None:
    ids = await venue(client)
    laser = await room(client, ids)
    assert laser["name"] == "Laser room" and laser["service_ids"] == [ids["service"]]
    listed = (await client.get(f"/businesses/{ids['business']}/resources")).json()
    assert [r["id"] for r in listed] == [laser["id"]]
    renamed = await client.patch(f"/resources/{laser['id']}", json={"name": "Room 2"})
    assert renamed.json()["name"] == "Room 2"
    assert renamed.json()["service_ids"] == [ids["service"]]  # unchanged when not sent
    # Bookings keep their time when a room goes; it's just no longer needed.
    assert (await client.delete(f"/resources/{laser['id']}")).status_code == 204
    assert (await client.get(f"/businesses/{ids['business']}/resources")).json() == []


async def test_one_room_means_one_booking_at_a_time_across_the_team(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    await room(client, ids)
    before = {(s["time"], s["staff_id"]) for s in await open_times(client, ids)}
    assert ("10:00", ilze) in before
    async with customer() as ana:
        first = await booked(ana, ids, time="10:00")
    # Marta has the room at 10:00, so Ilze can't take that time either.
    after = {(s["time"], s["staff_id"]) for s in await open_times(client, ids)}
    assert ("10:00", ilze) not in after and ("10:30", ilze) not in after
    assert ("10:45", ilze) in after
    async with customer("ilze-client@example.lv") as other:
        taken = await other.post("/bookings", json=request({**ids, "staff": ilze}, time="10:00"))
        assert taken.status_code == 409
        assert "room or equipment" in taken.json()["detail"]
    # Walk-ins too.
    clash = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in",
        json=walk_in({**ids, "staff": ilze}, start=f"{DAY}T10:15"),
    )
    assert clash.status_code == 409
    assert "room or equipment" in clash.json()["detail"]
    detail = (await client.get(f"/bookings/{first['id']}")).json()
    assert detail["resource_name"] == "Laser room"
    # Cancelling frees the room.
    assert (await client.patch(f"/bookings/{first['id']}/cancel")).status_code == 200
    assert ("10:00", ilze) in {(s["time"], s["staff_id"]) for s in await open_times(client, ids)}


async def test_two_rooms_take_two_bookings_and_moves_keep_a_room(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    await room(client, ids, "Room 1")
    await room(client, ids, "Room 2")
    marta = await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids))
    other = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in({**ids, "staff": ilze})
    )
    assert marta.status_code == other.status_code == 201, other.text
    names = {marta.json()["resource_name"], other.json()["resource_name"]}
    assert names == {"Room 1", "Room 2"}
    # Both rooms are busy at 10:00: Anna is free then, but there's no room for her.
    anna = await second_staff(client, ids, "Anna")
    third = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in",
        json=walk_in({**ids, "staff": anna}, start=f"{DAY}T12:00"),
    )
    assert third.status_code == 201
    moved = await client.patch(f"/bookings/{third.json()['id']}", json={"start": f"{DAY}T10:00"})
    assert moved.status_code == 409
    assert "room or equipment" in moved.json()["detail"]
    moved = await client.patch(f"/bookings/{third.json()['id']}", json={"start": f"{DAY}T14:00"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["resource_name"] in {"Room 1", "Room 2"}


async def test_a_room_at_another_location_does_not_count(client: AsyncClient) -> None:
    ids = await venue(client)
    second = await client.post(
        f"/businesses/{ids['business']}/locations",
        json={**LOCATION, "name": "Teika"},
    )
    assert second.status_code == 201, second.text
    made = await client.post(
        f"/businesses/{ids['business']}/resources",
        json={"name": "Old Town room", "location_id": second.json()["id"]},
    )
    await client.patch(f"/resources/{made.json()['id']}", json={"service_ids": [ids["service"]]})
    # Marta works at the first location, which has no room for this service.
    assert await open_times(client, ids) == []
    response = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids)
    )
    assert response.status_code == 409
    assert "room or equipment" in response.json()["detail"]


async def test_who_may_manage_rooms(client: AsyncClient) -> None:
    ids = await venue(client)
    laser = await room(client, ids)
    url = f"/businesses/{ids['business']}/resources"
    one = f"/resources/{laser['id']}"
    async with new_client() as visitor:
        assert (await visitor.get(url)).status_code == 401
        assert (await visitor.patch(one, json={"name": "X"})).status_code == 401
    async with customer() as ana:
        assert (await ana.get(url)).status_code == 403
        assert (await ana.delete(one)).status_code == 403
    async with staff_login(client, ids["staff"]) as marta:
        assert (await marta.get(url)).status_code == 403
        assert (await marta.post(url, json={"name": "X", "location_id": "x"})).status_code in (
            403,
            422,
        )
    async with new_client() as other:
        other_business, _ = await other_team(other)
        assert (await other.get(url)).status_code == 404
        assert (await other.patch(one, json={"name": "Mine"})).status_code == 404
        assert (await other.delete(one)).status_code == 404
        # Their own room can't be tied to this business's service or location.
        theirs = await other.get(f"/businesses/{other_business}/locations")
        made = await other.post(
            f"/businesses/{other_business}/resources",
            json={"name": "Theirs", "location_id": theirs.json()[0]["id"]},
        )
        assert made.status_code == 201, made.text
        foreign = await other.patch(
            f"/resources/{made.json()['id']}", json={"service_ids": [ids["service"]]}
        )
        assert foreign.status_code == 404
        wrong_place = await other.post(
            f"/businesses/{other_business}/resources",
            json={"name": "X", "location_id": await location(client, ids)},
        )
        assert wrong_place.status_code == 404
    assert (
        await client.post(url, json={"name": "", "location_id": laser["location_id"]})
    ).status_code == 422
