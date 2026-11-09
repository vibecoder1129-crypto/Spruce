"""Slice 7: waitlist (feature list: waitlist)."""

from datetime import date, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text

from app import email as mail
from app.db import get_engine
from tests.conftest import new_client
from tests.test_booking import DAY, booked, customer, open_times, venue
from tests.test_calendar import other_team, second_staff, staff_login


async def full_day(client: AsyncClient, ids: dict[str, str], first: AsyncClient) -> dict[str, Any]:
    """Blocks Marta's Tuesday except 10:00-10:45, which `first` books. Returns that booking."""
    for start, end in (("09:00", "10:00"), ("10:45", "17:00")):
        off = await client.post(
            f"/staff/{ids['staff']}/time-off",
            json={"start": f"{DAY}T{start}", "end": f"{DAY}T{end}", "reason": "Busy"},
        )
        assert off.status_code == 201, off.text
    booking = await booked(first, ids)
    async with new_client() as visitor:
        assert await open_times(visitor, ids) == []
    return booking


def join(ids: dict[str, str], day: str = DAY) -> dict[str, str]:
    return {"service_id": ids["service"], "date": day, "name": "Liga Ozola"}


async def test_a_customer_joins_a_full_day_and_hears_when_a_time_frees_up(
    client: AsyncClient,
) -> None:
    ids = await venue(client)
    async with customer("first@example.lv") as first, customer() as ana:
        booking = await full_day(client, ids, first)
        joined = await ana.post("/me/waitlist", json=join(ids))
        assert joined.status_code == 201, joined.text
        entry = joined.json()
        assert entry["date"] == DAY and entry["service_name"] and entry["business_name"]
        assert entry["notified"] is False
        assert (await ana.post("/me/waitlist", json=join(ids))).status_code == 409

        # The venue sees who is waiting that day.
        waiting = await client.get(f"/businesses/{ids['business']}/waitlist", params={"date": DAY})
        assert waiting.status_code == 200, waiting.text
        assert [(w["name"], w["service_name"]) for w in waiting.json()] == [
            ("Liga Ozola", entry["service_name"])
        ]

        # The venue cancels: Ana is told once.
        mail.outbox.clear()
        cancelled = await client.patch(f"/bookings/{booking['id']}/cancel")
        assert cancelled.status_code == 200, cancelled.text
        notices = [m for m in mail.outbox if m.to == "ana@example.lv"]
        assert len(notices) == 1
        assert "time opened up" in notices[0].subject
        assert f"/b/{ids['business']}/book?service={ids['service']}" in notices[0].text
        mine = (await ana.get("/me/waitlist")).json()
        assert mine[0]["notified"] is True

        # Booking that service that day takes her off the list.
        await booked(ana, ids)
        assert (await ana.get("/me/waitlist")).json() == []


async def test_moving_a_booking_away_notifies(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer("first@example.lv") as first, customer() as ana:
        booking = await full_day(client, ids, first)
        assert (await ana.post("/me/waitlist", json=join(ids))).status_code == 201
        # Moved to another day: the old time is free.
        later = (date.fromisoformat(DAY) + timedelta(days=7)).isoformat()
        next_week = (date.fromisoformat(DAY) + timedelta(days=6)).isoformat()
        shifts = await client.put(
            f"/businesses/{ids['business']}/shifts?week={next_week}",
            json={
                "shifts": [{"staff_id": ids["staff"], "day": 1, "starts": "09:00", "ends": "17:00"}]
            },
        )
        assert shifts.status_code == 200, shifts.text
        mail.outbox.clear()
        moved = await client.patch(f"/bookings/{booking['id']}", json={"start": f"{later}T10:00"})
        assert moved.status_code == 200, moved.text
        assert [m.to for m in mail.outbox].count("ana@example.lv") == 1


async def test_a_customer_cancelling_notifies_too(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer("first@example.lv") as first, customer() as ana:
        booking = await full_day(client, ids, first)
        assert (await ana.post("/me/waitlist", json=join(ids))).status_code == 201
        mail.outbox.clear()
        done = await first.patch(f"/bookings/{booking['id']}/cancel")
        assert done.status_code == 200, done.text
        assert [m.to for m in mail.outbox].count("ana@example.lv") == 1


async def test_a_day_with_open_times_is_booked_not_waited_for(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        response = await ana.post("/me/waitlist", json=join(ids))
        assert response.status_code == 409
        assert "open times" in response.json()["detail"]


async def test_days_and_numbers_are_limited(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        too_far = (date.fromisoformat(DAY) + timedelta(days=90)).isoformat()
        assert (await ana.post("/me/waitlist", json=join(ids, too_far))).status_code == 422
        yesterday = (date.today() - timedelta(days=2)).isoformat()
        assert (await ana.post("/me/waitlist", json=join(ids, yesterday))).status_code == 422
        # Days with no shift have no open times, so they can be waited for. Five at most.
        start = date.fromisoformat(DAY) + timedelta(days=1)
        for i in range(5):
            day = (start + timedelta(days=i)).isoformat()
            assert (await ana.post("/me/waitlist", json=join(ids, day))).status_code == 201
        sixth = (start + timedelta(days=5)).isoformat()
        response = await ana.post("/me/waitlist", json=join(ids, sixth))
        assert response.status_code == 409
        assert "5" in response.json()["detail"]


async def test_who_may_join_leave_and_see(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer("first@example.lv") as first:
        await full_day(client, ids, first)
    # Signed out: 401. A business account: 403.
    async with new_client() as visitor:
        assert (await visitor.post("/me/waitlist", json=join(ids))).status_code == 401
        assert (
            await visitor.get(f"/businesses/{ids['business']}/waitlist?date={DAY}")
        ).status_code == 401
    assert (await client.post("/me/waitlist", json=join(ids))).status_code == 403
    async with customer() as ana, customer("ilze@example.lv") as ilze:
        entry = (await ana.post("/me/waitlist", json=join(ids))).json()
        # Someone else's entry is a 404; a customer can't read a venue's list.
        assert (await ilze.delete(f"/me/waitlist/{entry['id']}")).status_code == 404
        assert (
            await ilze.get(f"/businesses/{ids['business']}/waitlist?date={DAY}")
        ).status_code == 403
        assert (await ana.delete(f"/me/waitlist/{entry['id']}")).status_code == 204
        assert (await ana.get("/me/waitlist")).json() == []
    # An unlisted venue's service is a 404.
    hidden = await venue(client, approved=False, email="hidden@example.lv")
    async with customer("zane@example.lv") as zane:
        assert (await zane.post("/me/waitlist", json=join(hidden))).status_code == 404
    # Another owner gets a 404 for this venue's list.
    async with new_client() as other:
        await other_team(other)
        assert (
            await other.get(f"/businesses/{ids['business']}/waitlist?date={DAY}")
        ).status_code == 404


async def test_staff_need_calendar_view(client: AsyncClient) -> None:
    ids = await venue(client)
    url = f"/businesses/{ids['business']}/waitlist?date={DAY}"
    async with staff_login(client, ids["staff"]) as marta:
        assert (await marta.get(url)).status_code == 403
    ilze = await second_staff(client, ids)
    async with staff_login(client, ilze, "calendar.view", email="ilze-staff@example.lv") as staff:
        assert (await staff.get(url)).status_code == 200


async def test_names_are_encrypted_and_never_audited(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer("first@example.lv") as first, customer() as ana:
        await full_day(client, ids, first)
        assert (await ana.post("/me/waitlist", json=join(ids))).status_code == 201
    async with get_engine().connect() as conn:
        raw = (await conn.execute(text("SELECT name_encrypted FROM waitlist_entries"))).scalar_one()
        assert b"Liga" not in raw
        audit = (
            (await conn.execute(text("SELECT metadata_json::text FROM audit_log"))).scalars().all()
        )
        assert not any("Liga" in (row or "") for row in audit)
