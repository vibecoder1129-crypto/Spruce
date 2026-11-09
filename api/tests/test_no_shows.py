"""Slice 6b: no-shows, cancellation window and client flags (LLD 3.5, 4.3, 5.6; HLD 4.8)."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.test_booking import DAY, booked, customer, open_times, venue
from tests.test_calendar import book, other_team, staff_login
from tests.test_marketplace import sql


async def started(booking_id: str, hours_ago: int = 1) -> None:
    """Moves a booking into the past, as if it had started."""
    await sql(
        "UPDATE bookings SET starts_at = now() - make_interval(hours => :h), "
        "ends_at = now() - make_interval(hours => :h) + interval '45 minutes' WHERE id = :id",
        h=hours_ago,
        id=booking_id,
    )


async def soon(booking_id: str, hours: int) -> None:
    """Moves a booking to start a few hours from now."""
    await sql(
        "UPDATE bookings SET starts_at = now() + make_interval(hours => :h), "
        "ends_at = now() + make_interval(hours => :h) + interval '45 minutes' WHERE id = :id",
        h=hours,
        id=booking_id,
    )


async def flags_on_board(client: AsyncClient, ids: dict[str, str], booking_id: str) -> list[str]:
    board = (await client.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
    found: list[str] = next(b for b in board["bookings"] if b["id"] == booking_id)["client_flags"]
    return found


async def visit(
    owner: AsyncClient, ana: AsyncClient, ids: dict[str, str], outcome: str, n: int
) -> None:
    """Ana books, the visit starts, and the venue marks the outcome."""
    booking = await booked(ana, ids, time="09:00")
    await started(booking["id"], hours_ago=n * 2)
    response = await owner.patch(f"/bookings/{booking['id']}/{outcome}")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == ("no_show" if outcome == "no-show" else "completed")


# --- outcomes --------------------------------------------------------------------------------


async def test_owner_marks_a_started_visit_done_or_no_show(client: AsyncClient) -> None:
    ids = await venue(client)
    first = await book(client, ids, start=f"{DAY}T10:00")
    second = await book(client, ids, start=f"{DAY}T11:00")
    await started(first["id"], 3)
    await started(second["id"], 1)
    assert (await client.patch(f"/bookings/{first['id']}/complete")).json()["status"] == "completed"
    assert (await client.patch(f"/bookings/{second['id']}/no-show")).json()["status"] == "no_show"
    async with get_engine().begin() as conn:
        actions = (
            (
                await conn.execute(
                    text("SELECT action_type FROM audit_log WHERE target_id IN (:a, :b)"),
                    {"a": first["id"], "b": second["id"]},
                )
            )
            .scalars()
            .all()
        )
    assert {"booking.complete", "booking.no_show"} <= set(actions)


async def test_outcomes_need_a_started_confirmed_visit(client: AsyncClient) -> None:
    ids = await venue(client)
    future = await book(client, ids, start=f"{DAY}T10:00")
    assert (await client.patch(f"/bookings/{future['id']}/no-show")).status_code == 409
    await started(future["id"])
    assert (await client.patch(f"/bookings/{future['id']}/no-show")).status_code == 200
    # Already marked.
    assert (await client.patch(f"/bookings/{future['id']}/complete")).status_code == 409
    cancelled = await book(client, ids, start=f"{DAY}T12:00")
    await client.patch(f"/bookings/{cancelled['id']}/cancel")
    await started(cancelled["id"], 3)
    assert (await client.patch(f"/bookings/{cancelled['id']}/complete")).status_code == 409


async def test_staff_need_checkout_own_and_their_own_column(client: AsyncClient) -> None:
    ids = await venue(client)
    visit_ = await book(client, ids, start=f"{DAY}T10:00")
    await started(visit_["id"])
    async with staff_login(client, ids["staff"], "calendar.view") as staff:
        board = (await staff.get(f"/businesses/{ids['business']}/calendar?date={DAY}")).json()
        assert board["can_mark_staff_ids"] == []
        assert (await staff.patch(f"/bookings/{visit_['id']}/no-show")).status_code == 403
        granted = await client.put(
            f"/staff/{ids['staff']}/permissions/checkout.own", json={"granted": True}
        )
        assert granted.status_code == 200
        assert (await staff.patch(f"/bookings/{visit_['id']}/no-show")).status_code == 200


async def test_customers_and_strangers_cannot_mark_outcomes(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        booking = await booked(ana, ids)
        await started(booking["id"])
        assert (await ana.patch(f"/bookings/{booking['id']}/no-show")).status_code == 403
    async with new_client() as anonymous:
        assert (await anonymous.patch(f"/bookings/{booking['id']}/no-show")).status_code == 401
    async with new_client() as other:
        await other_team(other)
        assert (await other.patch(f"/bookings/{booking['id']}/no-show")).status_code == 404


# --- flags -----------------------------------------------------------------------------------


async def test_two_no_shows_in_a_row_flag_the_customer_at_that_venue(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await visit(client, ana, ids, "no-show", 1)
        nxt = await booked(ana, ids, time="10:00")
        assert await flags_on_board(client, ids, nxt["id"]) == []
        await ana.patch(f"/bookings/{nxt['id']}/cancel")
        await visit(client, ana, ids, "no-show", 2)
        flagged = await booked(ana, ids, time="11:00")
        assert await flags_on_board(client, ids, flagged["id"]) == ["risk"]
        detail = (await client.get(f"/bookings/{flagged['id']}")).json()
        assert detail["client_flags"] == ["risk"]


async def test_a_finished_visit_resets_the_streak(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await visit(client, ana, ids, "no-show", 1)
        await visit(client, ana, ids, "complete", 2)
        await visit(client, ana, ids, "no-show", 3)
        nxt = await booked(ana, ids, time="10:00")
        assert await flags_on_board(client, ids, nxt["id"]) == []


async def test_two_finished_visits_make_a_regular(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await visit(client, ana, ids, "complete", 1)
        await visit(client, ana, ids, "complete", 2)
        nxt = await booked(ana, ids, time="10:00")
        assert await flags_on_board(client, ids, nxt["id"]) == ["regular"]


async def test_flags_stay_at_the_venue_that_set_them(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        await visit(client, ana, ids, "no-show", 1)
        await visit(client, ana, ids, "no-show", 2)
        async with new_client() as other_owner:
            other = await venue(other_owner, email="other@example.lv")
            elsewhere = await booked(ana, other, time="10:00")
            assert await flags_on_board(other_owner, other, elsewhere["id"]) == []


async def test_walk_ins_have_no_flags(client: AsyncClient) -> None:
    ids = await venue(client)
    walk_in = await book(client, ids, start=f"{DAY}T10:00")
    assert await flags_on_board(client, ids, walk_in["id"]) == []


# --- cancellation window ---------------------------------------------------------------------


async def window(client: AsyncClient, ids: dict[str, str], hours: int) -> Any:
    return await client.patch(f"/businesses/{ids['business']}", json={"cancel_window_hours": hours})


async def test_owner_sets_a_window_from_the_allowed_choices(client: AsyncClient) -> None:
    ids = await venue(client)
    response = await window(client, ids, 24)
    assert response.status_code == 200
    assert response.json()["cancel_window_hours"] == 24
    assert (await window(client, ids, 5)).status_code == 422
    store = (await client.get(f"/marketplace/businesses/{ids['business']}")).json()
    assert store["cancel_window_hours"] == 24


async def test_inside_the_window_the_customer_cannot_cancel_or_move(client: AsyncClient) -> None:
    ids = await venue(client)
    await window(client, ids, 24)
    async with customer() as ana:
        booking = await booked(ana, ids)
        mine = (await ana.get("/me/bookings")).json()["upcoming"][0]
        assert mine["can_change"] is True
        assert mine["cancel_window_hours"] == 24
        await soon(booking["id"], 3)
        assert (await ana.get("/me/bookings")).json()["upcoming"][0]["can_change"] is False
        refused = await ana.patch(f"/bookings/{booking['id']}/cancel")
        assert refused.status_code == 409
        assert "contact the venue" in refused.json()["detail"]
        times = await open_times(ana, ids)
        moved = await ana.patch(
            f"/bookings/{booking['id']}/reschedule", json={"start": f"{DAY}T{times[-1]['time']}"}
        )
        assert moved.status_code == 409
    # The venue can still cancel.
    assert (await client.patch(f"/bookings/{booking['id']}/cancel")).status_code == 200


async def test_only_the_owner_sets_the_window(client: AsyncClient) -> None:
    ids = await venue(client)
    async with staff_login(client, ids["staff"]) as staff:
        assert (await window(staff, ids, 24)).status_code == 403
