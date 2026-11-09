"""Slice 13: consultation forms and patch tests."""

from typing import Any

from httpx import AsyncClient

from tests.conftest import new_client
from tests.test_booking import DAY, booked, customer, request, venue
from tests.test_calendar import other_team, staff_login
from tests.test_marketplace import sql
from tests.test_resources import second_staff, walk_in

QUESTIONS = [
    {"label": "Any allergies?", "kind": "text"},
    {"label": "Are you pregnant?", "kind": "yes_no"},
]


async def form(client: AsyncClient, ids: dict[str, str], name: str = "Skin") -> dict[str, Any]:
    made = await client.post(
        f"/businesses/{ids['business']}/forms", json={"name": name, "questions": QUESTIONS}
    )
    assert made.status_code == 201, made.text
    linked = await client.patch(
        f"/forms/{made.json()['id']}", json={"service_ids": [ids["service"]]}
    )
    assert linked.status_code == 200, linked.text
    body: dict[str, Any] = linked.json()
    return body


async def needs_patch_test(client: AsyncClient, ids: dict[str, str]) -> None:
    response = await client.patch(f"/services/{ids['service']}", json={"needs_patch_test": True})
    assert response.status_code == 200, response.text
    assert response.json()["needs_patch_test"] is True


async def test_an_owner_writes_a_form_for_a_service(client: AsyncClient) -> None:
    ids = await venue(client)
    skin = await form(client, ids)
    assert skin["name"] == "Skin"
    assert skin["questions"] == QUESTIONS and skin["service_ids"] == [ids["service"]]
    listed = (await client.get(f"/businesses/{ids['business']}/forms")).json()
    assert [f["id"] for f in listed] == [skin["id"]]
    changed = await client.patch(
        f"/forms/{skin['id']}",
        json={"name": "Before your visit", "questions": QUESTIONS[:1]},
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["questions"] == QUESTIONS[:1]
    assert changed.json()["service_ids"] == [ids["service"]]  # unchanged when not sent
    # A service uses one form: linking it to a second form moves it.
    other = await client.post(
        f"/businesses/{ids['business']}/forms", json={"name": "Other", "questions": QUESTIONS}
    )
    moved = await client.patch(
        f"/forms/{other.json()['id']}", json={"service_ids": [ids["service"]]}
    )
    assert moved.json()["service_ids"] == [ids["service"]]
    listed = (await client.get(f"/businesses/{ids['business']}/forms")).json()
    assert {f["name"]: f["service_ids"] for f in listed} == {
        "Before your visit": [],
        "Other": [ids["service"]],
    }
    for bad in (
        {"name": "", "questions": QUESTIONS},
        {"name": "X", "questions": []},
        {"name": "X", "questions": [{"label": "", "kind": "text"}]},
        {"name": "X", "questions": [{"label": "Q", "kind": "photo"}]},
        {"name": "X", "questions": [{"label": "Q", "kind": "text"}] * 31},
    ):
        response = await client.post(f"/businesses/{ids['business']}/forms", json=bad)
        assert response.status_code == 422, bad
    assert (await client.delete(f"/forms/{other.json()['id']}")).status_code == 204
    assert len((await client.get(f"/businesses/{ids['business']}/forms")).json()) == 1


async def test_a_customer_fills_in_the_form_and_the_venue_reads_it(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        before = await booked(ana, ids, time="09:00")
        assert before["form"] == "none"
        await form(client, ids)
        visit = await booked(ana, ids, time="10:00")
        assert visit["form"] == "to_fill"
        url = f"/bookings/{visit['id']}/form"
        asked = (await ana.get(url)).json()
        assert asked["name"] == "Skin" and asked["questions"] == QUESTIONS
        assert asked["answers"] is None
        # One answer per question, of the right kind.
        for wrong in ([], ["None"], ["None", "yes"], [True, False], ["x" * 1001, False]):
            assert (
                await ana.put(url, json={"answers": wrong, "consent": True})
            ).status_code == 422, wrong
        # Health answers need the customer's consent.
        unagreed = await ana.put(url, json={"answers": ["Nuts", False]})
        assert unagreed.status_code == 422
        saved = await ana.put(url, json={"answers": ["Nuts", False], "consent": True})
        assert saved.status_code == 200, saved.text
        assert saved.json()["answers"] == ["Nuts", False]
        again = await ana.put(url, json={"answers": ["Nuts, latex", False], "consent": True})
        assert again.json()["answers"] == ["Nuts, latex", False]
        mine = (await ana.get("/me/bookings")).json()["upcoming"]
        # The form applies to every visit for the service, booked before it or after.
        assert {b["id"]: b["form"] for b in mine} == {
            before["id"]: "to_fill",
            visit["id"]: "filled",
        }
        # The form the customer answered stays as asked, even if the owner changes it later.
        forms = (await client.get(f"/businesses/{ids['business']}/forms")).json()
        await client.patch(f"/forms/{forms[0]['id']}", json={"questions": QUESTIONS[:1]})
        assert (await ana.get(url)).json()["questions"] == QUESTIONS
        # Someone else's booking is not found.
        async with customer("ilze@example.lv") as ilze:
            assert (await ilze.get(url)).status_code == 404
            assert (
                await ilze.put(url, json={"answers": ["x", True], "consent": True})
            ).status_code == 404
        # The venue reads it on the appointment.
        detail = (await client.get(f"/bookings/{visit['id']}")).json()
        assert detail["form"] == "filled"
        read = await client.get(url)
        assert read.status_code == 200 and read.json()["answers"] == ["Nuts, latex", False]
        # Only the customer answers.
        assert (
            await client.put(url, json={"answers": ["x", True], "consent": True})
        ).status_code == 403
        # No changes once cancelled.
        assert (await ana.patch(f"/bookings/{visit['id']}/cancel")).status_code == 200
        assert (
            await ana.put(url, json={"answers": ["x", True], "consent": True})
        ).status_code == 409
        # Once the service no longer uses a form, an unanswered visit has nothing to read.
        await client.patch(f"/forms/{forms[0]['id']}", json={"service_ids": []})
        assert (await ana.get(f"/bookings/{before['id']}/form")).status_code == 404
        assert (await ana.get(url)).status_code == 200  # answers already given stay


async def test_answers_close_when_the_visit_starts_and_survive_the_form(
    client: AsyncClient,
) -> None:
    ids = await venue(client)
    skin = await form(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
        url = f"/bookings/{visit['id']}/form"
        assert (
            await ana.put(url, json={"answers": ["None", False], "consent": True})
        ).status_code == 200
        # Removing the form keeps the answers already given.
        assert (await client.delete(f"/forms/{skin['id']}")).status_code == 204
        assert (await ana.get(url)).json()["answers"] == ["None", False]
        await sql(
            "UPDATE bookings SET starts_at = now() - interval '1 hour',"
            " ends_at = now() - interval '15 minutes' WHERE id = :id",
            id=visit["id"],
        )
        assert (
            await ana.put(url, json={"answers": ["x", True], "consent": True})
        ).status_code == 409


async def test_who_reads_the_answers(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    await form(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
        url = f"/bookings/{visit['id']}/form"
        await ana.put(url, json={"answers": ["None", True], "consent": True})
    async with new_client() as visitor:
        assert (await visitor.get(url)).status_code == 401
    # Marta does the visit; Ilze can see the whole calendar but not Marta's client's answers.
    async with staff_login(client, ids["staff"], "calendar.view") as marta:
        assert (await marta.get(url)).json()["answers"] == ["None", True]
    async with staff_login(
        client, ilze, "calendar.view", "calendar.team", email="ilze@example.lv"
    ) as other:
        assert (await other.get(f"/bookings/{visit['id']}")).status_code == 200
        assert (await other.get(url)).status_code == 404
    async with new_client() as stranger:
        await other_team(stranger)
        assert (await stranger.get(url)).status_code == 404


async def test_who_may_manage_forms(client: AsyncClient) -> None:
    ids = await venue(client)
    skin = await form(client, ids)
    url = f"/businesses/{ids['business']}/forms"
    one = f"/forms/{skin['id']}"
    async with new_client() as visitor:
        assert (await visitor.get(url)).status_code == 401
        assert (await visitor.patch(one, json={"name": "X"})).status_code == 401
    async with customer() as ana:
        assert (await ana.get(url)).status_code == 403
        assert (await ana.delete(one)).status_code == 403
    async with staff_login(client, ids["staff"]) as marta:
        assert (await marta.get(url)).status_code == 403
        assert (
            await marta.post(url, json={"name": "X", "questions": QUESTIONS})
        ).status_code == 403
    async with new_client() as other:
        other_business, _ = await other_team(other)
        assert (await other.get(url)).status_code == 404
        assert (await other.patch(one, json={"name": "Mine"})).status_code == 404
        assert (await other.delete(one)).status_code == 404
        theirs = await other.post(
            f"/businesses/{other_business}/forms", json={"name": "Theirs", "questions": QUESTIONS}
        )
        assert theirs.status_code == 201, theirs.text
        # Their form can't be tied to this business's service.
        foreign = await other.patch(
            f"/forms/{theirs.json()['id']}", json={"service_ids": [ids["service"]]}
        )
        assert foreign.status_code == 404


# --- patch tests -----------------------------------------------------------------------------


async def test_a_service_that_needs_a_patch_test(client: AsyncClient) -> None:
    ids = await venue(client)
    async with customer() as ana:
        first = await booked(ana, ids, time="09:00")  # before the service needed one
        await needs_patch_test(client, ids)
        shown = await ana.get(f"/marketplace/businesses/{ids['business']}")
        assert shown.json()["services"][0]["needs_patch_test"] is True
        refused = await ana.post("/bookings", json=request(ids, time="10:00"))
        assert refused.status_code == 409
        assert "patch test" in refused.json()["detail"]
        detail = (await client.get(f"/bookings/{first['id']}")).json()
        assert detail["needs_patch_test"] is True and detail["patch_test_at"] is None
        # The venue records one on any visit; the customer can then book.
        recorded = await client.post(f"/bookings/{first['id']}/patch-test")
        assert recorded.status_code == 200, recorded.text
        assert recorded.json()["patch_test_at"] is not None
        later = await booked(ana, ids, time="11:00")
        # Too recent: 47 hours before the visit.
        await sql(
            "UPDATE customer_profiles SET patch_test_at ="
            " CAST(:day AS timestamp) AT TIME ZONE 'Europe/Riga' - interval '47 hours'"
            " WHERE business_id = :b",
            day=f"{DAY}T12:00:00",
            b=ids["business"],
        )
        moved = await ana.patch(
            f"/bookings/{later['id']}/reschedule", json={"start": f"{DAY}T12:00"}
        )
        assert moved.status_code == 409 and "patch test" in moved.json()["detail"]
        # Too old: more than 6 months before.
        await sql(
            "UPDATE customer_profiles SET patch_test_at = now() - interval '183 days'"
            " WHERE business_id = :b",
            b=ids["business"],
        )
        assert (await ana.patch(f"/bookings/{first['id']}/cancel")).status_code == 200
        again = await ana.post("/bookings", json=request(ids, time="13:00"))
        assert again.status_code == 409
    # The venue can still book it itself.
    made = await client.post(f"/businesses/{ids['business']}/bookings/walk-in", json=walk_in(ids))
    assert made.status_code == 201, made.text
    assert made.json()["needs_patch_test"] is True
    # A guest has no account to keep it on.
    guest = await client.post(f"/bookings/{made.json()['id']}/patch-test")
    assert guest.status_code == 409


async def test_who_may_record_a_patch_test(client: AsyncClient) -> None:
    ids = await venue(client)
    ilze = await second_staff(client, ids)
    async with customer() as ana:
        visit = await booked(ana, ids)
        url = f"/bookings/{visit['id']}/patch-test"
        assert (await ana.post(url)).status_code == 403
    async with new_client() as visitor:
        assert (await visitor.post(url)).status_code == 401
    async with staff_login(
        client, ilze, "calendar.view", "calendar.team", "checkout.own", email="ilze@example.lv"
    ) as other:
        assert (await other.post(url)).status_code == 403  # not her visit
    async with staff_login(client, ids["staff"], "calendar.view") as marta:
        assert (await marta.post(url)).status_code == 403  # no checkout.own yet
        granted = await client.put(
            f"/staff/{ids['staff']}/permissions/checkout.own", json={"granted": True}
        )
        assert granted.status_code == 200, granted.text
        assert (await marta.post(url)).status_code == 200
    async with new_client() as stranger:
        await other_team(stranger)
        assert (await stranger.post(url)).status_code == 404
