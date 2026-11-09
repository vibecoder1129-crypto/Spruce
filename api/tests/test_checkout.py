"""Slice 14: checkout, commissions and tips."""

from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from httpx import AsyncClient

from tests.conftest import new_client
from tests.test_booking import DAY, booked, customer, venue
from tests.test_calendar import other_team, staff_login
from tests.test_marketplace import sql
from tests.test_resources import second_staff, walk_in

TODAY = datetime.now(ZoneInfo("Europe/Riga")).date().isoformat()
PAID = {"price_minor": 4000, "tip_minor": 500, "method": "card"}


async def started(booking_id: str, hours_earlier: int = 0) -> None:
    """Stands in for the clock: the visit began half an hour (plus some hours) ago."""
    await sql(
        "UPDATE bookings SET"
        " starts_at = now() - interval '30 minutes' - make_interval(hours => :h),"
        " ends_at = now() + interval '15 minutes' - make_interval(hours => :h) WHERE id = :id",
        id=booking_id,
        h=hours_earlier,
    )


async def visit(client: AsyncClient, ids: dict[str, str], time: str = "10:00") -> str:
    """A walk-in that has started, so it can be checked out."""
    made = await client.post(
        f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids, f"{DAY}T{time}")
    )
    assert made.status_code == 201, made.text
    booking_id: str = made.json()["id"]
    await started(booking_id, hours_earlier=int(time[:2]) - 9)
    return booking_id


def takings(client: AsyncClient, url: str, start: str = TODAY, end: str = TODAY) -> Any:
    return client.get(url, params={"from": start, "to": end})


async def test_checkout_records_the_sale_and_finishes_the_visit(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        mine = await booked(ana, ids)
    await started(mine["id"])
    url = f"/bookings/{mine['id']}/checkout"
    for bad in (
        {**PAID, "price_minor": -1},
        {**PAID, "tip_minor": 10_000_001},
        {**PAID, "price_minor": 40.5},
        {**PAID, "method": "crypto"},
        {"price_minor": 4000},
    ):
        assert (await client.post(url, json=bad)).status_code == 422, bad
    done = await client.post(url, json=PAID)
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "completed"
    assert body["sale"] == {
        "price_minor": 4000,
        "tip_minor": 500,
        "method": "card",
        "currency": "EUR",
    }
    # It counts as a finished visit for the customer, and happens once.
    assert (await client.post(url, json=PAID)).status_code == 409
    assert (await client.get(f"/bookings/{mine['id']}")).json()["sale"]["tip_minor"] == 500


async def test_only_a_started_open_visit_checks_out(client: AsyncClient) -> None:
    ids = await venue(client)
    later = await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids))
    url = f"/bookings/{later.json()['id']}/checkout"
    assert (await client.post(url, json=PAID)).status_code == 409  # not started yet
    await started(later.json()["id"])
    assert (await client.patch(f"/bookings/{later.json()['id']}/no-show")).status_code == 200
    assert (await client.post(url, json=PAID)).status_code == 409  # a no-show


async def test_commission_is_kept_as_it_was_at_checkout(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    for bad in (-1, 101, 12.5):
        response = await client.patch(f"/staff/{ids['staff']}", json={"commission_percent": bad})
        assert response.status_code == 422, bad
    rate = await client.patch(f"/staff/{ids['staff']}", json={"commission_percent": 40})
    assert rate.status_code == 200 and rate.json()["commission_percent"] == 40
    first = await visit(client, ids, "09:00")
    await client.post(f"/bookings/{first}/checkout", json={**PAID, "price_minor": 3333})
    await client.patch(f"/staff/{ids['staff']}", json={"commission_percent": 50})
    second = await visit(client, ids, "11:00")
    await client.post(
        f"/bookings/{second}/checkout", json={"price_minor": 2000, "tip_minor": 0, "method": "cash"}
    )
    other = await visit(client, {**ids, "staff": ilze}, "13:00")
    await client.post(f"/bookings/{other}/checkout", json={**PAID, "tip_minor": 0})

    url = f"/businesses/{ids['business']}/takings"
    response = await takings(client, url)
    assert response.status_code == 200, response.text
    report = response.json()
    rows = {r["staff_id"]: r for r in report["rows"]}
    # 40% of 33.33 is 13.33 (rounded); then 50% of 20.00. Tips are not commissioned.
    assert rows[ids["staff"]] == {
        "staff_id": ids["staff"],
        "display_name": "Marta",
        "visits": 2,
        "sales_minor": 5333,
        "tips_minor": 500,
        "commission_minor": 1333 + 1000,
    }
    assert rows[ilze]["visits"] == 1 and rows[ilze]["commission_minor"] == 0
    assert report["totals"] == {
        "visits": 3,
        "sales_minor": 9333,
        "tips_minor": 500,
        "commission_minor": 2333,
    }
    assert report["currency"] == "EUR"


async def test_takings_cover_only_the_dates_and_this_business(client: AsyncClient) -> None:
    ids = await venue(client)
    booking = await visit(client, ids)
    await client.post(f"/bookings/{booking}/checkout", json=PAID)
    url = f"/businesses/{ids['business']}/takings"
    yesterday = (datetime.fromisoformat(TODAY) - timedelta(days=1)).date().isoformat()
    empty = (await takings(client, url, yesterday, yesterday)).json()
    assert empty["rows"] == [] and empty["totals"]["visits"] == 0
    for start, end in ((TODAY, yesterday), ("2026-01-01", "2026-06-01"), ("x", TODAY)):
        assert (await takings(client, url, start, end)).status_code == 422, (start, end)
    async with new_client() as other:
        theirs, _ = await other_team(other)
        assert (await takings(other, url)).status_code == 404
        assert (await takings(other, f"/businesses/{theirs}/takings")).json()["rows"] == []


async def test_who_may_check_out_and_see_takings(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    booking = await visit(client, ids)
    url = f"/bookings/{booking}/checkout"
    report = f"/businesses/{ids['business']}/takings"
    async with new_client() as visitor:
        assert (await visitor.post(url, json=PAID)).status_code == 401
        assert (await takings(visitor, report)).status_code == 401
        assert (await takings(visitor, "/me/takings")).status_code == 401
    async with customer() as ana:
        assert (await ana.post(url, json=PAID)).status_code == 403
        assert (await takings(ana, report)).status_code == 403
        assert (await takings(ana, "/me/takings")).status_code == 403
    async with staff_login(
        client, ilze, "calendar.view", "calendar.team", "checkout.own", email="ilze@example.lv"
    ) as other:
        assert (await other.post(url, json=PAID)).status_code == 403  # not her visit
    async with staff_login(client, ids["staff"], "calendar.view") as marta:
        assert (await marta.post(url, json=PAID)).status_code == 403
        assert (await takings(marta, report)).status_code == 403
        assert (await takings(marta, "/me/takings")).status_code == 403
        for flag in ("checkout.own", "reports.own"):
            granted = await client.put(
                f"/staff/{ids['staff']}/permissions/{flag}", json={"granted": True}
            )
            assert granted.status_code == 200, granted.text
        assert (await marta.post(url, json=PAID)).status_code == 200
        own = (await takings(marta, "/me/takings")).json()
        assert [r["staff_id"] for r in own["rows"]] == [ids["staff"]]
        assert own["totals"]["tips_minor"] == 500
    async with new_client() as stranger:
        await other_team(stranger)
        assert (await stranger.post(url, json=PAID)).status_code == 404
