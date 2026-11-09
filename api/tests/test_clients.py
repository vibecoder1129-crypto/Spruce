"""Slice 6a: business-local clients and import from Fresha (HLD 4.8, LLD 3.5)."""

from httpx import AsyncClient
from sqlalchemy import text

from app.db import get_engine
from tests.conftest import new_client
from tests.helpers import onboarded, owner, signup

ROWS = [
    {
        "name": "Ana Ozola",
        "phone": "+371 2000 0001",
        "email": "Ana@Example.lv",
        "notes": "Likes tea",
    },
    {"name": "Jānis Bērziņš", "phone": "20000002"},
    {"name": "Līga", "email": "liga@example.lv"},
]


async def business(client: AsyncClient, email: str = "owner@example.lv") -> str:
    await owner(client, email)
    return await onboarded(client)


async def do_import(client: AsyncClient, business_id: str, rows: list[dict], dry_run: bool = False):  # type: ignore[no-untyped-def,type-arg]
    return await client.post(
        f"/businesses/{business_id}/clients/import", json={"rows": rows, "dry_run": dry_run}
    )


async def test_owner_imports_clients_and_lists_them_by_name(client: AsyncClient) -> None:
    business_id = await business(client)
    response = await do_import(client, business_id, ROWS)
    assert response.status_code == 200, response.text
    assert response.json() == {"total": 3, "added": 3, "duplicates": 0, "invalid": []}

    listed = (await client.get(f"/businesses/{business_id}/clients")).json()
    assert [c["name"] for c in listed] == ["Ana Ozola", "Jānis Bērziņš", "Līga"]
    assert listed[0]["email"] == "Ana@Example.lv"
    assert listed[0]["phone"] == "+371 2000 0001"
    assert listed[0]["notes"] == "Likes tea"
    assert listed[0]["source"] == "imported"


async def test_a_dry_run_counts_but_saves_nothing(client: AsyncClient) -> None:
    business_id = await business(client)
    preview = await do_import(client, business_id, ROWS, dry_run=True)
    assert preview.json() == {"total": 3, "added": 3, "duplicates": 0, "invalid": []}
    assert (await client.get(f"/businesses/{business_id}/clients")).json() == []


async def test_duplicates_by_email_or_phone_are_skipped(client: AsyncClient) -> None:
    business_id = await business(client)
    await do_import(client, business_id, ROWS)
    again = [
        {"name": "Ana O.", "email": " ana@example.LV "},  # same email, other case
        {"name": "Jānis", "phone": "2000-0002"},  # same phone, other format
        {"name": "Pēteris", "phone": "29999999"},
        {"name": "Pēteris twin", "phone": "2999 9999"},  # same as the row above, in one file
    ]
    response = await do_import(client, business_id, again)
    assert response.json() == {"total": 4, "added": 1, "duplicates": 3, "invalid": []}
    assert len((await client.get(f"/businesses/{business_id}/clients")).json()) == 4


async def test_bad_rows_are_reported_and_good_rows_still_import(client: AsyncClient) -> None:
    business_id = await business(client)
    rows = [
        {"name": "Ana"},
        {"name": "  "},
        {"name": "Bad email", "email": "not-an-email"},
        {"name": "Bad phone", "phone": "12"},
    ]
    response = await do_import(client, business_id, rows)
    body = response.json()
    assert body["added"] == 1
    assert [i["row"] for i in body["invalid"]] == [2, 3, 4]
    assert body["invalid"][0]["reason"] == "Name is missing."
    assert body["invalid"][1]["reason"] == "Email doesn't look right."
    assert body["invalid"][2]["reason"] == "Phone needs 6 to 15 digits."


async def test_at_most_5000_rows_at_once(client: AsyncClient) -> None:
    business_id = await business(client)
    rows = [{"name": f"Client {i}"} for i in range(5001)]
    assert (await do_import(client, business_id, rows, dry_run=True)).status_code == 422


async def test_imports_are_rate_limited(client: AsyncClient) -> None:
    business_id = await business(client)
    for _ in range(20):
        assert (
            await do_import(client, business_id, [{"name": "A"}], dry_run=True)
        ).status_code == 200
    assert (await do_import(client, business_id, [{"name": "A"}], dry_run=True)).status_code == 429


async def test_the_audit_entry_has_counts_only(client: AsyncClient) -> None:
    business_id = await business(client)
    await do_import(client, business_id, ROWS)
    query = text("SELECT metadata_json::text FROM audit_log WHERE action_type = :a")
    async with get_engine().begin() as conn:
        row = (await conn.execute(query, {"a": "clients.imported"})).scalar_one()
    assert "added" in row
    for value in ("Ana", "example.lv", "2000", "tea"):
        assert value not in row


async def test_clients_are_stored_encrypted(client: AsyncClient) -> None:
    business_id = await business(client)
    await do_import(client, business_id, ROWS)
    async with get_engine().begin() as conn:
        blob = (
            await conn.execute(text("SELECT details_encrypted FROM clients LIMIT 1"))
        ).scalar_one()
    assert b"Ana" not in blob and b"example" not in blob


async def test_signed_out_is_401(client: AsyncClient) -> None:
    business_id = await business(client)
    async with new_client() as anon:
        assert (await anon.get(f"/businesses/{business_id}/clients")).status_code == 401
        assert (await do_import(anon, business_id, ROWS)).status_code == 401


async def test_customers_are_403(client: AsyncClient) -> None:
    business_id = await business(client)
    async with new_client() as consumer:
        await signup(consumer, "ana@example.lv")
        assert (await consumer.get(f"/businesses/{business_id}/clients")).status_code == 403
        assert (await do_import(consumer, business_id, ROWS)).status_code == 403


async def test_another_owners_clients_are_404(client: AsyncClient) -> None:
    business_id = await business(client)
    await do_import(client, business_id, ROWS)
    async with new_client() as other:
        await business(other, "other@example.lv")
        assert (await other.get(f"/businesses/{business_id}/clients")).status_code == 404
        assert (await do_import(other, business_id, ROWS)).status_code == 404
