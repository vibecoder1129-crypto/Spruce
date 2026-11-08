"""Slice 4: shifts, time off, the day board and walk-ins (LLD 3.3, 4.2, 4.4, 5.1; HLD 4.4-4.6)."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import onboarded, owner, platform_admin, signup
from tests.test_team import SERVICE, accept, first_staff, invite, team

# Monday 7 January 2030. Riga is UTC+2 in winter.
WEEK = "2030-01-07"
DAY = "2030-01-08"  # Tuesday, day 1
TUESDAY_9_TO_5 = {"day": 1, "starts": "09:00", "ends": "17:00"}


async def salon(client: AsyncClient) -> dict[str, str]:
    """An owner with one staff member working Tuesday 09:00-17:00 and one assigned service."""
    business_id, staff_id = await team(client)
    service = await client.post(f"/businesses/{business_id}/services", json=SERVICE)
    service_id = service.json()["id"]
    await client.put(f"/staff/{staff_id}/services", json={"service_ids": [service_id]})
    shifts = await client.put(
        f"/businesses/{business_id}/shifts?week={WEEK}",
        json={"shifts": [{"staff_id": staff_id, **TUESDAY_9_TO_5}]},
    )
    assert shifts.status_code == 200, shifts.text
    return {"business": business_id, "staff": staff_id, "service": service_id}


async def other_team(client: AsyncClient) -> tuple[str, str]:
    """A second owner's business with one staff member. Returns (business_id, staff_id)."""
    await owner(client, "other@example.lv")
    business_id = await onboarded(client, submit=False)
    return business_id, await first_staff(client, business_id)


async def second_staff(client: AsyncClient, ids: dict[str, str]) -> str:
    location = (await client.get(f"/businesses/{ids['business']}/locations")).json()[0]["id"]
    staff = await client.post(
        f"/businesses/{ids['business']}/staff",
        json={"display_name": "Ilze", "title": "Colourist", "location_id": location},
    )
    staff_id: str = staff.json()["id"]
    await client.put(f"/staff/{staff_id}/services", json={"service_ids": [ids["service"]]})
    shifts = [
        {"staff_id": ids["staff"], **TUESDAY_9_TO_5},
        {"staff_id": staff_id, **TUESDAY_9_TO_5},
    ]
    response = await client.put(
        f"/businesses/{ids['business']}/shifts?week={WEEK}", json={"shifts": shifts}
    )
    assert response.status_code == 200, response.text
    return staff_id


def walk_in(ids: dict[str, str], start: str = f"{DAY}T10:00", **extra: Any) -> dict[str, Any]:
    return {
        "staff_id": ids["staff"],
        "service_id": ids["service"],
        "start": start,
        "guest": {"name": "Liga Ozola", "phone": "+371 2000 0000"},
        **extra,
    }


async def book(client: AsyncClient, ids: dict[str, str], **kw: Any) -> dict[str, Any]:
    response = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids, **kw)
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


@asynccontextmanager
async def staff_login(
    client: AsyncClient, staff_id: str, *flags: str, email: str = "marta@example.lv"
) -> AsyncIterator[AsyncClient]:
    for flag in flags:
        granted = await client.put(f"/staff/{staff_id}/permissions/{flag}", json={"granted": True})
        assert granted.status_code == 200, granted.text
    token = await invite(client, staff_id, email)
    async with new_client() as staff:
        await accept(staff, token)
        yield staff


# --- shifts ----------------------------------------------------------------------------------


async def test_owner_sets_a_week_of_shifts_and_reads_it_back(client: AsyncClient) -> None:
    ids = await salon(client)
    shifts = (await client.get(f"/businesses/{ids['business']}/shifts?week={WEEK}")).json()
    assert shifts == [{"staff_id": ids["staff"], "day": 1, "starts": "09:00", "ends": "17:00"}]
    # Another week is empty: shifts are dated, not a recurring rule.
    other = await client.get(f"/businesses/{ids['business']}/shifts?week=2030-01-14")
    assert other.json() == []


async def test_saving_a_week_replaces_it(client: AsyncClient) -> None:
    ids = await salon(client)
    wednesday = {"staff_id": ids["staff"], "day": 2, "starts": "10:00", "ends": "18:30"}
    response = await client.put(
        f"/businesses/{ids['business']}/shifts?week={WEEK}", json={"shifts": [wednesday]}
    )
    assert response.status_code == 200
    shifts = (await client.get(f"/businesses/{ids['business']}/shifts?week={WEEK}")).json()
    assert [s["day"] for s in shifts] == [2]


async def test_shift_weeks_and_times_are_checked(client: AsyncClient) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/shifts"
    one = {"staff_id": ids["staff"], **TUESDAY_9_TO_5}
    assert (await client.put(f"{url}?week=2030-01-08", json={"shifts": [one]})).status_code == 422
    bad = [
        {**one, "starts": "09:10"},
        {**one, "ends": "08:00"},
        {**one, "day": 7},
    ]
    for shift in bad:
        response = await client.put(f"{url}?week={WEEK}", json={"shifts": [shift]})
        assert response.status_code == 422, shift
    twice = await client.put(f"{url}?week={WEEK}", json={"shifts": [one, one]})
    assert twice.status_code == 422


async def test_shifts_only_for_your_own_staff(client: AsyncClient) -> None:
    ids = await salon(client)
    async with new_client() as other:
        _, their_staff = await other_team(other)
        response = await client.put(
            f"/businesses/{ids['business']}/shifts?week={WEEK}",
            json={"shifts": [{"staff_id": their_staff, **TUESDAY_9_TO_5}]},
        )
        assert response.status_code == 404
        theirs = await other.get(f"/businesses/{ids['business']}/shifts?week={WEEK}")
        assert theirs.status_code == 404


async def test_staff_see_their_own_week_but_never_edit_shifts(client: AsyncClient) -> None:
    ids = await salon(client)
    every_flag = ["calendar.view", "calendar.team", "appointments.own", "checkout.own"]
    async with staff_login(client, ids["staff"], *every_flag) as staff:
        mine = await staff.get(f"/me/shifts?week={WEEK}")
        assert mine.status_code == 200
        assert mine.json() == [
            {"staff_id": ids["staff"], "day": 1, "starts": "09:00", "ends": "17:00"}
        ]
        put = await staff.put(
            f"/businesses/{ids['business']}/shifts?week={WEEK}", json={"shifts": []}
        )
        assert put.status_code == 403
        block = await staff.post(
            f"/staff/{ids['staff']}/time-off", json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00"}
        )
        assert block.status_code == 403


async def test_shifts_need_an_owner(client: AsyncClient) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/shifts?week={WEEK}"
    async with new_client() as anonymous:
        assert (await anonymous.get(url)).status_code == 401
    async with new_client() as consumer:
        await signup(consumer, "ana@example.lv")
        assert (await consumer.get(url)).status_code == 403
        assert (await consumer.get(f"/me/shifts?week={WEEK}")).status_code == 403
    async with new_client() as admin:
        await platform_admin(admin)
        assert (await admin.get(url)).status_code == 403


# --- time off --------------------------------------------------------------------------------


async def test_owner_blocks_time_and_removes_it(client: AsyncClient) -> None:
    ids = await salon(client)
    response = await client.post(
        f"/staff/{ids['staff']}/time-off",
        json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00", "reason": "Lunch"},
    )
    assert response.status_code == 201, response.text
    block = response.json()
    assert block["starts_at"] == "2030-01-08T10:00:00Z"
    assert block["reason"] == "Lunch"
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    assert [b["id"] for b in board["time_off"]] == [block["id"]]
    assert (await client.delete(f"/time-off/{block['id']}")).status_code == 204
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    assert board["time_off"] == []


async def test_time_off_must_end_after_it_starts(client: AsyncClient) -> None:
    ids = await salon(client)
    response = await client.post(
        f"/staff/{ids['staff']}/time-off", json={"start": f"{DAY}T13:00", "end": f"{DAY}T12:00"}
    )
    assert response.status_code == 422


async def test_another_owners_time_off_is_404(client: AsyncClient) -> None:
    ids = await salon(client)
    block = await client.post(
        f"/staff/{ids['staff']}/time-off", json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00"}
    )
    async with new_client() as other:
        await other_team(other)
        assert (await other.delete(f"/time-off/{block.json()['id']}")).status_code == 404
        response = await other.post(
            f"/staff/{ids['staff']}/time-off", json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00"}
        )
        assert response.status_code == 404


# --- walk-ins --------------------------------------------------------------------------------


async def test_owner_adds_a_walk_in(client: AsyncClient) -> None:
    ids = await salon(client)
    booking = await book(client, ids, notes="Prefers a quiet chair")
    assert booking["status"] == "confirmed"
    assert booking["source"] == "owner"
    # 10:00 in Riga is 08:00 UTC; the end comes from the 45-minute service.
    assert booking["starts_at"] == "2030-01-08T08:00:00Z"
    assert booking["ends_at"] == "2030-01-08T08:45:00Z"
    assert booking["price_minor"] == 3500
    assert booking["currency"] == "EUR"
    assert booking["client_name"] == "Liga Ozola"
    detail = (await client.get(f"/bookings/{booking['id']}")).json()
    assert detail["guest_phone"] == "+371 2000 0000"
    assert detail["notes"] == "Prefers a quiet chair"


async def test_end_and_price_are_never_taken_from_the_client(client: AsyncClient) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    for extra in ({"end": f"{DAY}T10:05"}, {"price_minor": 1}, {"status": "completed"}):
        response = await client.post(url, json=walk_in(ids, **extra))
        assert response.status_code == 422, extra


async def test_guest_details_are_encrypted_and_never_audited(client: AsyncClient) -> None:
    ids = await salon(client)
    await book(client, ids, notes="Allergic to latex")
    async with get_engine().connect() as conn:
        raw = (await conn.execute(text("SELECT guest_encrypted FROM bookings"))).scalar_one()
        audit = (await conn.execute(text("SELECT metadata_json::text FROM audit_log"))).scalars()
        logged = " ".join(audit)
    assert b"Liga" not in raw
    assert "Liga" not in logged and "2000" not in logged and "latex" not in logged


async def test_walk_ins_must_fit_the_shift(client: AsyncClient) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    for start in (f"{DAY}T08:30", f"{DAY}T16:30", "2030-01-09T10:00"):
        response = await client.post(url, json=walk_in(ids, start=start))
        assert response.status_code == 409, start
        assert "shift" in response.json()["detail"]


async def test_walk_ins_respect_blocked_time(client: AsyncClient) -> None:
    ids = await salon(client)
    await client.post(
        f"/staff/{ids['staff']}/time-off", json={"start": f"{DAY}T12:00", "end": f"{DAY}T13:00"}
    )
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    response = await client.post(url, json=walk_in(ids, start=f"{DAY}T11:30"))
    assert response.status_code == 409
    assert "blocked" in response.json()["detail"]
    assert (await client.post(url, json=walk_in(ids, start=f"{DAY}T13:00"))).status_code == 201


async def test_a_time_the_clocks_skip_is_rejected(client: AsyncClient) -> None:
    ids = await salon(client)
    # Riga moves from 03:00 to 04:00 on Sunday 31 March 2030.
    response = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in",
        json=walk_in(ids, start="2030-03-31T03:30"),
    )
    assert response.status_code == 422
    assert "clocks" in response.text


async def test_service_must_be_active_and_assigned(client: AsyncClient) -> None:
    ids = await salon(client)
    other = await client.post(
        f"/businesses/{ids['business']}/services", json={**SERVICE, "name": "Colour"}
    )
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    unassigned = walk_in(ids, service_id=other.json()["id"])
    assert (await client.post(url, json=unassigned)).status_code == 404
    await client.patch(f"/services/{ids['service']}", json={"active": False})
    assert (await client.post(url, json=walk_in(ids))).status_code == 404


async def test_overlapping_bookings_are_refused_and_cancelling_frees_the_slot(
    client: AsyncClient,
) -> None:
    ids = await salon(client)
    first = await book(client, ids)
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    clash = await client.post(url, json=walk_in(ids, start=f"{DAY}T10:30"))
    assert clash.status_code == 409
    assert clash.json()["detail"] == "That time was just taken."
    # Back to back is fine: ranges are half-open.
    assert (await client.post(url, json=walk_in(ids, start=f"{DAY}T10:45"))).status_code == 201
    cancelled = await client.patch(f"/bookings/{first['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert (await client.post(url, json=walk_in(ids, start=f"{DAY}T10:00"))).status_code == 201


async def test_fifty_concurrent_bookings_for_one_slot_make_exactly_one(
    client: AsyncClient,
) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/bookings/walk-in"
    responses = await asyncio.gather(*(client.post(url, json=walk_in(ids)) for _ in range(50)))
    codes = sorted(r.status_code for r in responses)
    assert codes.count(201) == 1, codes
    assert codes.count(409) == 49, codes
    async with get_engine().connect() as conn:
        count = (await conn.execute(text("SELECT count(*) FROM bookings"))).scalar_one()
    assert count == 1


async def test_owner_moves_a_booking_and_the_rules_apply_again(client: AsyncClient) -> None:
    ids = await salon(client)
    booking = await book(client, ids)
    moved = await client.patch(f"/bookings/{booking['id']}", json={"start": f"{DAY}T14:15"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["starts_at"] == "2030-01-08T12:15:00Z"
    outside = await client.patch(f"/bookings/{booking['id']}", json={"start": f"{DAY}T18:00"})
    assert outside.status_code == 409
    notes = await client.patch(f"/bookings/{booking['id']}", json={"notes": "Running late"})
    assert notes.json()["notes"] == "Running late"
    await client.patch(f"/bookings/{booking['id']}/cancel")
    again = await client.patch(f"/bookings/{booking['id']}", json={"notes": "x"})
    assert again.status_code == 409


async def test_another_owners_bookings_are_404(client: AsyncClient) -> None:
    ids = await salon(client)
    booking = await book(client, ids)
    async with new_client() as other:
        await other_team(other)
        assert (await other.get(f"/bookings/{booking['id']}")).status_code == 404
        assert (await other.patch(f"/bookings/{booking['id']}/cancel")).status_code == 404
        assert (
            await other.patch(f"/bookings/{booking['id']}", json={"notes": "x"})
        ).status_code == 404
        walk = await other.post(
            f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids)
        )
        assert walk.status_code == 404
        board = await other.get(f"/businesses/{ids['business']}/calendar?date={DAY}")
        assert board.status_code == 404


# --- the day board ---------------------------------------------------------------------------


async def test_owner_sees_every_column_with_shifts_and_bookings(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    booking = await book(client, ids)
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    assert board["timezone"] == "Europe/Riga"
    assert [c["id"] for c in board["staff"]] == [ids["staff"], ilze]
    assert board["staff"][0]["shift"] == {"starts": "09:00", "ends": "17:00"}
    assert [b["id"] for b in board["bookings"]] == [booking["id"]]
    assert board["can_block_time"] is True
    assert sorted(board["can_book_staff_ids"]) == sorted([ids["staff"], ilze])
    [service] = board["services"]
    assert service["id"] == ids["service"]
    assert sorted(service["staff_ids"]) == sorted([ids["staff"], ilze])
    # A day off has columns but no shifts.
    monday = (await client.get(f"/businesses/{ids['business']}/calendar?date={WEEK}")).json()
    assert [c["shift"] for c in monday["staff"]] == [None, None]


async def test_cancelled_bookings_leave_the_board(client: AsyncClient) -> None:
    ids = await salon(client)
    booking = await book(client, ids)
    await client.patch(f"/bookings/{booking['id']}/cancel")
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    assert board["bookings"] == []


async def test_staff_need_calendar_view_to_see_the_board(client: AsyncClient) -> None:
    ids = await salon(client)
    async with staff_login(client, ids["staff"]) as staff:
        board = await staff.get(f"/businesses/{ids['business']}/calendar?date={DAY}")
        assert board.status_code == 403


async def test_calendar_view_shows_only_your_own_column(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    await book(client, ids)
    theirs = await book(client, {**ids, "staff": ilze})
    async with staff_login(client, ids["staff"], "calendar.view") as staff:
        board = (await staff.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
        assert [c["id"] for c in board["staff"]] == [ids["staff"]]
        assert all(b["staff_id"] == ids["staff"] for b in board["bookings"])
        assert board["can_block_time"] is False
        assert board["can_book_staff_ids"] == []
        assert board["services"] == []
        assert (await staff.get(f"/bookings/{theirs['id']}")).status_code == 404


async def test_calendar_team_shows_everyone(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    async with staff_login(client, ids["staff"], "calendar.view", "calendar.team") as staff:
        board = (await staff.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
        assert [c["id"] for c in board["staff"]] == [ids["staff"], ilze]


async def test_staff_cannot_open_another_business_calendar(client: AsyncClient) -> None:
    ids = await salon(client)
    async with new_client() as other:
        other_business, _ = await other_team(other)
        async with staff_login(client, ids["staff"], "calendar.view") as staff:
            board = await staff.get(f"/businesses/{other_business}/calendar?date={DAY}")
            assert board.status_code == 404


async def test_calendar_needs_a_business_member(client: AsyncClient) -> None:
    ids = await salon(client)
    url = f"/businesses/{ids['business']}/calendar?date={DAY}"
    async with new_client() as anonymous:
        assert (await anonymous.get(url)).status_code == 401
    async with new_client() as consumer:
        await signup(consumer, "ana@example.lv")
        assert (await consumer.get(url)).status_code == 403
    async with new_client() as admin:
        await platform_admin(admin)
        assert (await admin.get(url)).status_code == 403


# --- staff appointments.own ------------------------------------------------------------------


async def test_appointments_own_books_and_cancels_on_your_own_column(client: AsyncClient) -> None:
    ids = await salon(client)
    async with staff_login(client, ids["staff"], "calendar.view", "appointments.own") as staff:
        board = (await staff.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
        assert board["can_book_staff_ids"] == [ids["staff"]]
        assert [s["id"] for s in board["services"]] == [ids["service"]]
        booking = await book(staff, ids)
        assert booking["source"] == "owner"
        moved = await staff.patch(f"/bookings/{booking['id']}", json={"start": f"{DAY}T11:00"})
        assert moved.status_code == 200
        assert (await staff.patch(f"/bookings/{booking['id']}/cancel")).status_code == 200


async def test_appointments_own_never_reaches_another_column(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    theirs = await book(client, {**ids, "staff": ilze})
    mine = await book(client, ids)
    flags = ("calendar.view", "appointments.own")
    async with staff_login(client, ids["staff"], *flags) as staff:
        url = f"/businesses/{ids['business']}/bookings/walk-in"
        response = await staff.post(url, json=walk_in({**ids, "staff": ilze}, start=f"{DAY}T12:00"))
        assert response.status_code == 403
        assert (await staff.patch(f"/bookings/{theirs['id']}/cancel")).status_code == 404
        move = await staff.patch(f"/bookings/{mine['id']}", json={"staff_id": ilze})
        assert move.status_code == 403


async def test_seeing_the_team_is_not_changing_it(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    theirs = await book(client, {**ids, "staff": ilze})
    flags = ("calendar.view", "calendar.team", "appointments.own")
    async with staff_login(client, ids["staff"], *flags) as staff:
        assert (await staff.get(f"/bookings/{theirs['id']}")).status_code == 200
        assert (await staff.patch(f"/bookings/{theirs['id']}/cancel")).status_code == 403


async def test_without_appointments_own_staff_cannot_book(client: AsyncClient) -> None:
    ids = await salon(client)
    mine = await book(client, ids)
    async with staff_login(client, ids["staff"], "calendar.view") as staff:
        url = f"/businesses/{ids['business']}/bookings/walk-in"
        assert (await staff.post(url, json=walk_in(ids, start=f"{DAY}T12:00"))).status_code == 403
        assert (await staff.patch(f"/bookings/{mine['id']}/cancel")).status_code == 403
