"""Slice 6c (B): one person's week on the calendar (HLD 4.5)."""

from httpx import AsyncClient

from tests.conftest import new_client
from tests.helpers import signup
from tests.test_calendar import (
    DAY,
    WEEK,
    book,
    other_team,
    salon,
    second_staff,
    staff_login,
)


def url(ids: dict[str, str], staff_id: str | None = None, week: str = WEEK) -> str:
    who = staff_id or ids["staff"]
    return f"/businesses/{ids['business']}/calendar/week?staff_id={who}&week={week}"


async def test_owner_sees_one_persons_week(client: AsyncClient) -> None:
    ids = await salon(client)
    tuesday = await book(client, ids)
    await client.patch(f"/bookings/{(await book(client, ids, start=f'{DAY}T12:00'))['id']}/cancel")
    week = (await client.get(url(ids))).json()
    assert week["week"] == WEEK
    assert week["timezone"] == "Europe/Riga"
    assert week["staff"]["id"] == ids["staff"]
    assert [d["date"] for d in week["days"]][:2] == [WEEK, DAY]
    assert len(week["days"]) == 7
    assert week["days"][1]["shift"] == {"starts": "09:00", "ends": "17:00"}
    assert week["days"][0]["shift"] is None
    # Cancelled bookings leave the week, like the day board.
    assert [b["id"] for b in week["bookings"]] == [tuesday["id"]]
    assert week["bookings"][0]["client_flags"] == []


async def test_the_week_must_start_on_a_monday(client: AsyncClient) -> None:
    ids = await salon(client)
    assert (await client.get(url(ids, week=DAY))).status_code == 422


async def test_staff_need_calendar_view_for_the_week(client: AsyncClient) -> None:
    ids = await salon(client)
    async with staff_login(client, ids["staff"]) as staff:
        assert (await staff.get(url(ids))).status_code == 403


async def test_staff_see_only_their_own_week_without_calendar_team(client: AsyncClient) -> None:
    ids = await salon(client)
    ilze = await second_staff(client, ids)
    async with staff_login(client, ids["staff"], "calendar.view") as staff:
        assert (await staff.get(url(ids))).status_code == 200
        assert (await staff.get(url(ids, ilze))).status_code == 404


async def test_another_business_week_is_404(client: AsyncClient) -> None:
    ids = await salon(client)
    async with new_client() as other:
        other_business, other_staff = await other_team(other)
        theirs = {"business": other_business, "staff": other_staff}
        assert (await client.get(url(theirs))).status_code == 404
        # Their staff member through our business id is a 404 too.
        assert (await client.get(url(ids, other_staff))).status_code == 404


async def test_the_week_needs_a_business_member(client: AsyncClient) -> None:
    ids = await salon(client)
    async with new_client() as anonymous:
        assert (await anonymous.get(url(ids))).status_code == 401
    async with new_client() as consumer:
        await signup(consumer, "ana@example.lv")
        assert (await consumer.get(url(ids))).status_code == 403
