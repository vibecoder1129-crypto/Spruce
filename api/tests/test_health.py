from httpx import AsyncClient

from app.security import SECURITY_HEADERS


async def test_health_reaches_the_database(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_every_response_carries_security_headers(client: AsyncClient) -> None:
    for path in ("/health", "/does-not-exist"):
        response = await client.get(path)
        for key, value in SECURITY_HEADERS.items():
            assert response.headers[key] == value, (path, key)


async def test_cors_rejects_unknown_origins(client: AsyncClient) -> None:
    response = await client.options(
        "/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in response.headers
