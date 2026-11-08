"""Slice 5b: availability and customer booking (LLD 3.3, 4.2, 5.1; HLD 4.4)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app import email as mail
from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import owner, signup
from tests.test_calendar import other_team
from tests.test_marketplace import sql
from tests.test_team import SERVICE, team

# A Tuesday next week, always in the future and inside the 60-day window.
_today = datetime.now(ZoneInfo("Europe/Riga")).date()
WEEK = (_today - timedelta(days=_today.weekday()) + timedelta(days=7)).isoformat()
DAY = (date.fromisoformat(WEEK) + timedelta(days=1)).isoformat()
TUESDAY_9_TO_5 = {"day": 1, "starts": "09:00", "ends": "17:00"}


async def venue(client: AsyncClient, *, approved: bool = True) -> dict[str, str]:
    """An approved salon: Marta works Tuesday 09:00-17:00 and does a 45-minute haircut."""
    business_id, staff_id = await team(client)
    service = await client.post(f"/businesses/{business_id}/services", json=SERVICE)
    service_id = service.json()["id"]
    await client.put(f"/staff/{staff_id}/services", json={"service_ids": [service_id]})
    shifts = await client.put(
        f"/businesses/{business_id}/shifts?week={WEEK}",
        json={"shifts": [{"staff_id": staff_id, **TUESDAY_9_TO_5}]},
    )
    assert shifts.status_code == 200, shifts.text
    if approved:
        await sql(
            "UPDATE businesses SET approval_status = 'approved' WHERE id = :id", id=business_id
        )
    return {"business": business_id, "staff": staff_id, "service": service_id}


async def open_times(
    client: AsyncClient, ids: dict[str, str], day: str = DAY, **extra: str
) -> list[dict[str, str]]:
    response = await client.get(
        f"/marketplace/businesses/{ids['business']}/availability",
        params={"service_id": ids["service"], "date": day, **extra},
    )
    assert response.status_code == 200, response.text
    slots: list[dict[str, str]] = response.json()["slots"]
    return slots


def request(ids: dict[str, str], time: str = "10:00", **extra: Any) -> dict[str, Any]:
    return {
        "service_id": ids["service"],
        "staff_id": ids["staff"],
        "start": f"{DAY}T{time}",
        "name": "Ana Berzina",
        "phone": "+371 2111 1111",
        **extra,
    }


@asynccontextmanager
async def customer(email: str = "ana@example.lv") -> AsyncIterator[AsyncClient]:
    async with new_client() as client:
        assert (await signup(client, email)).status_code == 201
        yield client


async def booked(client: AsyncClient, ids: dict[str, str], **kw: Any) -> dict[str, Any]:
    response = await client.post("/bookings", json=request(ids, **kw))
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


# --- availability ----------------------------------------------------------------------------


async def test_open_times_follow_the_shift_bookings_and_time_off(client: AsyncClient) -> None:
    ids = await venue(client)
    async with new_client() as visitor:
        slots = await open_times(visitor, ids)
        assert len(slots) == 30  # 09:00 to 16:15, every 15 minutes, for a 45-minute service
        assert slots[0] == {"staff_id": ids["staff"], "time": "09:00"}
        assert slots[-1]["time"] == "16:15"
        # A 10:00 walk-in takes out every start that would overlap it.
        walk_in = {
            "staff_id": ids["staff"],
            "service_id": ids["service"],
            "start": f"{DAY}T10:00",
            "guest": {"name": "Liga"},
        }
        made = await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in)
        assert made.status_code == 201, made.text
        times = [s["time"] for s in await open_times(visitor, ids)]
        assert len(times) == 25
        assert "09:15" in times and "10:45" in times
        assert not {"09:30", "10:00", "10:30"} & set(times)
        # Time off from 12:00 to 13:00 takes out 11:30 to 12:45.
        off = await client.post(
            f"/staff/{ids['staff']}/time-off",
            json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00", "reason": "Lunch"},
        )
        assert off.status_code == 201, off.text
        assert len(await open_times(visitor, ids)) == 19
        # No shift that day, no times.
        assert await open_times(visitor, ids, day=WEEK) == []


async def test_each_professional_who_does_the_service_is_offered(client: AsyncClient) -> None:
    ids = await venue(client)
    location = (await client.get(f"/businesses/{ids['business']}/locations")).json()[0]["id"]
    ilze = (
        await client.post(
            f"/businesses/{ids['business']}/staff",
            json={"display_name": "Ilze", "title": "Colourist", "location_id": location},
        )
    ).json()["id"]
    shifts = [
        {"staff_id": ids["staff"], **TUESDAY_9_TO_5},
        {"staff_id": ilze, "day": 1, "starts": "13:00", "ends": "15:00"},
    ]
    await client.put(f"/businesses/{ids['business']}/shifts?week={WEEK}", json={"shifts": shifts})
    async with new_client() as visitor:
        # Ilze works but doesn't do haircuts yet.
        assert {s["staff_id"] for s in await open_times(visitor, ids)} == {ids["staff"]}
        await client.put(f"/staff/{ilze}/services", json={"service_ids": [ids["service"]]})
        mine = await open_times(visitor, ids, staff_id=ilze)
        assert [s["time"] for s in mine] == ["13:00", "13:15", "13:30", "13:45", "14:00", "14:15"]
        assert len(await open_times(visitor, ids)) == 36
        # Sorted by time, then by person.
        both = await open_times(visitor, ids)
        assert [s["time"] for s in both] == sorted(s["time"] for s in both)


async def test_a_venue_that_isnt_public_has_no_times_and_cant_be_booked(
    client: AsyncClient,
) -> None:
    ids = await venue(client, approved=False)
    async with customer() as ana:
        response = await ana.get(
            f"/marketplace/businesses/{ids['business']}/availability",
            params={"service_id": ids["service"], "date": DAY},
        )
        assert response.status_code == 404
        assert (await ana.post("/bookings", json=request(ids))).status_code == 404


async def test_dates_must_be_from_today_to_sixty_days_ahead(client: AsyncClient) -> None:
    ids = await venue(client)
    url = f"/marketplace/businesses/{ids['business']}/availability"
    async with new_client() as visitor:
        for day in (_today - timedelta(days=1), _today + timedelta(days=61)):
            response = await visitor.get(
                url, params={"service_id": ids["service"], "date": str(day)}
            )
            assert response.status_code == 422, day
        today = await visitor.get(url, params={"service_id": ids["service"], "date": str(_today)})
        assert today.status_code == 200


async def test_a_service_nobody_does_has_no_times(client: AsyncClient) -> None:
    ids = await venue(client)
    other = await client.post(
        f"/businesses/{ids['business']}/services",
        json={**SERVICE, "name": "Massage", "category": "massage"},
    )
    async with new_client() as visitor:
        assert await open_times(visitor, {**ids, "service": other.json()["id"]}) == []


# --- booking ---------------------------------------------------------------------------------


async def test_customer_books_an_open_time_and_the_venue_sees_it(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        mail.outbox.clear()
        booking = await booked(ana, ids, notes="First visit")
        assert booking["status"] == "confirmed"
        assert booking["service_name"] == "Haircut"
        assert booking["staff_name"] == "Marta"
        assert booking["price_minor"] == 3500 and booking["currency"] == "EUR"
        assert booking["start"] == f"{DAY}T10:00" and booking["end"] == f"{DAY}T10:45"
        assert booking["timezone"] == "Europe/Riga"
        assert booking["can_change"] is True
        [sent] = mail.outbox
        assert sent.to == "ana@example.lv"
        assert "confirmed" in sent.subject.lower() and "10:00" in sent.text
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    [row] = board["bookings"]
    assert row["source"] == "consumer"
    assert row["client_name"] == "Ana Berzina"
    detail = (await client.get(f"/bookings/{row['id']}")).json()
    assert detail["guest_phone"] == "+371 2111 1111"
    assert detail["notes"] == "First visit"


async def test_the_server_decides_end_price_and_status(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        for extra in ({"end": f"{DAY}T10:05"}, {"price_minor": 1}, {"status": "completed"}):
            response = await ana.post("/bookings", json=request(ids, **extra))
            assert response.status_code == 422, extra
        assert (await ana.post("/bookings", json=request(ids, name=""))).status_code == 422


async def test_taken_closed_or_past_times_are_refused(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await booked(ana, ids)
        taken = await ana.post("/bookings", json=request(ids, time="10:30"))
        assert taken.status_code == 409
        closed = await ana.post("/bookings", json=request(ids, time="16:30"))
        assert closed.status_code == 409
        past = await ana.post(
            "/bookings", json=request(ids, start=f"{_today - timedelta(days=1)}T10:00")
        )
        assert past.status_code == 422
        far = await ana.post(
            "/bookings", json=request(ids, start=f"{_today + timedelta(days=61)}T10:00")
        )
        assert far.status_code == 422


async def test_only_customers_book(client: AsyncClient) -> None:
    ids = await venue(client)
    assert (await client.post("/bookings", json=request(ids))).status_code == 403
    async with new_client() as anonymous:
        assert (await anonymous.post("/bookings", json=request(ids))).status_code == 401
        assert (await anonymous.get("/me/bookings")).status_code == 401
    assert (await client.get("/me/bookings")).status_code == 403


async def test_a_professional_who_doesnt_do_the_service_is_404(client: AsyncClient) -> None:
    ids = await venue(client)
    async with new_client() as other:
        _, stranger = await other_team(other)
    async with customer() as ana:
        response = await ana.post("/bookings", json=request(ids, staff_id=stranger))
        assert response.status_code == 404


async def test_name_and_phone_are_encrypted_and_never_audited(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await booked(ana, ids, notes="Allergic to latex")
    async with get_engine().connect() as conn:
        raw = (await conn.execute(text("SELECT guest_encrypted FROM bookings"))).scalar_one()
        audit = (await conn.execute(text("SELECT metadata_json::text FROM audit_log"))).scalars()
        logged = " ".join(a or "" for a in audit)
    assert b"Berzina" not in raw
    assert "Berzina" not in logged and "2111" not in logged and "latex" not in logged


# --- abuse limits ----------------------------------------------------------------------------


async def test_at_most_two_upcoming_bookings_at_one_venue(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await booked(ana, ids, time="09:00")
        await booked(ana, ids, time="11:00")
        third = await ana.post("/bookings", json=request(ids, time="13:00"))
        assert third.status_code == 409
        assert "already have" in third.json()["detail"]


async def test_upcoming_bookings_are_capped_overall(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.booking import customer as module

    monkeypatch.setattr(module, "MAX_UPCOMING", 1)
    ids = await venue(client)
    async with customer() as ana:
        await booked(ana, ids, time="09:00")
        second = await ana.post("/bookings", json=request(ids, time="11:00"))
        assert second.status_code == 409


async def test_booking_attempts_are_rate_limited(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        codes = [
            (await ana.post("/bookings", json=request(ids, time="16:30"))).status_code
            for _ in range(11)
        ]
        assert codes[:10] == [409] * 10
        assert codes[10] == 429


# --- my bookings, cancel and reschedule ------------------------------------------------------


async def test_my_bookings_lists_upcoming_and_past_and_only_mine(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana, customer("ben@example.lv") as ben:
        booking = await booked(ana, ids)
        walk_in = {
            "staff_id": ids["staff"],
            "service_id": ids["service"],
            "start": f"{DAY}T14:00",
            "guest": {"name": "Liga"},
        }
        await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in)
        # A visit last month, moved into the past directly.
        old = await booked(ana, ids, time="12:00")
        await sql(
            "UPDATE bookings SET starts_at = now() - interval '30 days', "
            "ends_at = now() - interval '30 days' + interval '45 minutes', status = 'completed' "
            "WHERE id = :id",
            id=old["id"],
        )
        mine = (await ana.get("/me/bookings")).json()
        assert [b["id"] for b in mine["upcoming"]] == [booking["id"]]
        assert [b["id"] for b in mine["past"]] == [old["id"]]
        assert mine["past"][0]["can_change"] is False
        assert mine["upcoming"][0]["business_id"] == ids["business"]
        assert mine["upcoming"][0]["address"]
        assert (await ben.get("/me/bookings")).json() == {"upcoming": [], "past": []}
        # Someone else's booking is a 404, for cancel and for reschedule.
        assert (await ben.patch(f"/bookings/{booking['id']}/cancel")).status_code == 404
        moved = await ben.patch(
            f"/bookings/{booking['id']}/reschedule", json={"start": f"{DAY}T15:00"}
        )
        assert moved.status_code == 404


async def test_customer_moves_and_cancels_with_an_email_each_time(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        booking = await booked(ana, ids)
        mail.outbox.clear()
        moved = await ana.patch(
            f"/bookings/{booking['id']}/reschedule", json={"start": f"{DAY}T14:00"}
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["start"] == f"{DAY}T14:00"
        times = [s["time"] for s in await open_times(ana, ids)]
        assert "10:00" in times and "14:00" not in times
        # Moving onto a taken or closed time is refused, and the booking stays put.
        bad = await ana.patch(
            f"/bookings/{booking['id']}/reschedule", json={"start": f"{DAY}T16:45"}
        )
        assert bad.status_code == 409
        cancelled = await ana.patch(f"/bookings/{booking['id']}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert cancelled.json()["can_change"] is False
        again = await ana.patch(f"/bookings/{booking['id']}/cancel")
        assert again.status_code == 409
        subjects = [m.subject.lower() for m in mail.outbox]
        assert any("moved" in s for s in subjects)
        assert any("cancelled" in s for s in subjects)
        assert all(m.to == "ana@example.lv" for m in mail.outbox)


async def test_a_visit_that_has_started_cant_change(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        booking = await booked(ana, ids)
        await sql(
            "UPDATE bookings SET starts_at = now() - interval '5 minutes', "
            "ends_at = now() + interval '40 minutes' WHERE id = :id",
            id=booking["id"],
        )
        assert (await ana.patch(f"/bookings/{booking['id']}/cancel")).status_code == 409


async def test_the_venue_cancelling_emails_the_customer(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        booking = await booked(ana, ids)
    mail.outbox.clear()
    response = await client.patch(f"/bookings/{booking['id']}/cancel")
    assert response.status_code == 200
    [sent] = mail.outbox
    assert sent.to == "ana@example.lv" and "cancelled" in sent.subject.lower()


async def test_an_owner_cannot_use_the_customer_reschedule(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        booking = await booked(ana, ids)
    response = await client.patch(
        f"/bookings/{booking['id']}/reschedule", json={"start": f"{DAY}T14:00"}
    )
    assert response.status_code == 403
    async with new_client() as other:
        await owner(other, "stranger@example.lv")
        assert (await other.patch(f"/bookings/{booking['id']}/cancel")).status_code == 404
