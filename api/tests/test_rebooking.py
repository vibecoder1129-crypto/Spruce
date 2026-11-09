"""Slice 9: rebooking reminders and Book again."""

import re
from typing import Any

from httpx import AsyncClient

from app import email as mail
from app.booking.reminders import send_reminders
from app.db import get_sessionmaker
from tests.conftest import new_client
from tests.test_booking import booked, customer, venue
from tests.test_marketplace import sql


async def finished(ids: dict[str, str], visit: dict[str, Any], weeks_ago: float) -> None:
    """Moves a booking into the past and marks it done."""
    await sql(
        "UPDATE bookings SET status = 'completed',"
        " starts_at = now() - make_interval(secs => :s) - interval '45 minutes',"
        " ends_at = now() - make_interval(secs => :s) WHERE id = :id",
        s=weeks_ago * 7 * 86400,
        id=visit["id"],
    )


async def remind() -> int:
    async with get_sessionmaker()() as db:
        return await send_reminders(db)


async def every(client: AsyncClient, ids: dict[str, str], weeks: int = 6) -> None:
    response = await client.patch(f"/services/{ids['service']}", json={"rebook_weeks": weeks})
    assert response.status_code == 200, response.text
    assert response.json()["rebook_weeks"] == weeks


async def test_a_due_visit_gets_one_reminder_with_a_link(client: AsyncClient) -> None:
    ids = await venue(client)
    await every(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
    await finished(ids, visit, weeks_ago=6.1)
    mail.outbox.clear()
    assert await remind() == 1
    [message] = mail.outbox
    assert message.to == "ana@example.lv"
    assert "next" in message.subject.lower()
    assert (
        f"/b/{ids['business']}/book?service={ids['service']}&staff={ids['staff']}" in message.text
    )
    assert "/account" in message.text
    assert await remind() == 0  # once per visit


async def test_not_yet_due_too_old_or_switched_off_sends_nothing(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        visit = await booked(ana, ids)
    await finished(ids, visit, weeks_ago=6.1)
    assert await remind() == 0  # the service has no rebook time
    await every(client, ids, 8)
    assert await remind() == 0  # not due yet
    await every(client, ids, 4)
    assert await remind() == 0  # due two weeks ago: too old to bring up now


async def test_customers_can_turn_reminders_off(client: AsyncClient) -> None:
    ids = await venue(client)
    await every(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
        off = await ana.patch("/me", json={"rebook_reminders": False})
        assert off.status_code == 200, off.text
        assert off.json()["rebook_reminders"] is False
    await finished(ids, visit, weeks_ago=6.1)
    assert await remind() == 0


async def test_no_reminder_when_already_back_or_booked(client: AsyncClient) -> None:
    ids = await venue(client)
    await every(client, ids)
    async with customer() as ana:
        first = await booked(ana, ids, time="10:00")
        upcoming = await booked(ana, ids, time="14:00")
        await finished(ids, first, weeks_ago=6.1)
        assert await remind() == 0  # an upcoming booking here
        await finished(ids, upcoming, weeks_ago=1)
        assert await remind() == 0  # came back after the first visit, and the second isn't due


async def test_an_unlisted_venue_sends_nothing(client: AsyncClient) -> None:
    ids = await venue(client)
    await every(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
    await finished(ids, visit, weeks_ago=6.1)
    await sql(
        "UPDATE businesses SET approval_status = 'suspended' WHERE id = :id", id=ids["business"]
    )
    assert await remind() == 0


async def test_who_may_change_what(client: AsyncClient) -> None:
    ids = await venue(client)
    assert (
        await client.patch(f"/services/{ids['service']}", json={"rebook_weeks": 5})
    ).status_code == 422
    async with new_client() as visitor:
        assert (await visitor.patch("/me", json={"rebook_reminders": False})).status_code == 401
    assert (await client.patch("/me", json={"rebook_reminders": False})).status_code == 403
    async with customer() as ana:
        assert (
            await ana.patch(f"/services/{ids['service']}", json={"rebook_weeks": 6})
        ).status_code == 403
        me = (await ana.get("/me")).json()
        assert me["rebook_reminders"] is True


async def test_every_reminder_has_a_one_click_stop_link(client: AsyncClient) -> None:
    ids = await venue(client)
    await every(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
        await finished(ids, visit, weeks_ago=6.1)
        mail.outbox.clear()
        assert await remind() == 1
        found = re.search(r"/emails/stop\?u=([0-9a-f-]+)&t=([\w-]+)", mail.outbox[0].text)
        assert found is not None
        user_id, token = found.groups()
        async with new_client() as anyone:  # works from the email, without logging in
            wrong = await anyone.post(
                "/emails/stop", json={"user_id": user_id, "token": token[:-2] + "xx"}
            )
            assert wrong.status_code == 404
            other = "00000000-0000-0000-0000-000000000000"
            assert (
                await anyone.post("/emails/stop", json={"user_id": other, "token": token})
            ).status_code == 404
            assert (await ana.get("/me")).json()["rebook_reminders"] is True
            stopped = await anyone.post("/emails/stop", json={"user_id": user_id, "token": token})
            assert stopped.status_code == 204, stopped.text
            # Using the link twice is fine.
            again = await anyone.post("/emails/stop", json={"user_id": user_id, "token": token})
            assert again.status_code == 204
        assert (await ana.get("/me")).json()["rebook_reminders"] is False
