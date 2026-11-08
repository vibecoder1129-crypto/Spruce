"""Launch countries and server-side geocoding (LLD 3.2, feature list 7.2).

Coordinates are never taken from the client: the server geocodes the address it is given.
Addresses are not logged.
"""

import hashlib
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.config import get_settings
from app.ratelimit import hit

# EU 27 plus Iceland, Liechtenstein, Norway and Switzerland. The first time zone is the default;
# overseas regions outside Europe are left out until the business needs them.
COUNTRIES: dict[str, tuple[str, tuple[str, ...]]] = {
    "AT": ("Austria", ("Europe/Vienna",)),
    "BE": ("Belgium", ("Europe/Brussels",)),
    "BG": ("Bulgaria", ("Europe/Sofia",)),
    "CH": ("Switzerland", ("Europe/Zurich",)),
    "CY": ("Cyprus", ("Asia/Nicosia",)),
    "CZ": ("Czechia", ("Europe/Prague",)),
    "DE": ("Germany", ("Europe/Berlin",)),
    "DK": ("Denmark", ("Europe/Copenhagen",)),
    "EE": ("Estonia", ("Europe/Tallinn",)),
    "ES": ("Spain", ("Europe/Madrid", "Atlantic/Canary")),
    "FI": ("Finland", ("Europe/Helsinki",)),
    "FR": ("France", ("Europe/Paris",)),
    "GR": ("Greece", ("Europe/Athens",)),
    "HR": ("Croatia", ("Europe/Zagreb",)),
    "HU": ("Hungary", ("Europe/Budapest",)),
    "IE": ("Ireland", ("Europe/Dublin",)),
    "IS": ("Iceland", ("Atlantic/Reykjavik",)),
    "IT": ("Italy", ("Europe/Rome",)),
    "LI": ("Liechtenstein", ("Europe/Vaduz",)),
    "LT": ("Lithuania", ("Europe/Vilnius",)),
    "LU": ("Luxembourg", ("Europe/Luxembourg",)),
    "LV": ("Latvia", ("Europe/Riga",)),
    "MT": ("Malta", ("Europe/Malta",)),
    "NL": ("Netherlands", ("Europe/Amsterdam",)),
    "NO": ("Norway", ("Europe/Oslo",)),
    "PL": ("Poland", ("Europe/Warsaw",)),
    "PT": ("Portugal", ("Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira")),
    "RO": ("Romania", ("Europe/Bucharest",)),
    "SE": ("Sweden", ("Europe/Stockholm",)),
    "SI": ("Slovenia", ("Europe/Ljubljana",)),
    "SK": ("Slovakia", ("Europe/Bratislava",)),
}

# The currency a business in each country prices in. Everyone else uses the euro.
CURRENCY: dict[str, str] = {
    "CZ": "CZK",
    "DK": "DKK",
    "HU": "HUF",
    "PL": "PLN",
    "RO": "RON",
    "SE": "SEK",
    "IS": "ISK",
    "NO": "NOK",
    "CH": "CHF",
    "LI": "CHF",
}


def currency_for(country_code: str) -> str:
    return CURRENCY.get(country_code, "EUR")


NOT_FOUND = "We couldn't find that address. Check the street, postcode and city."


@dataclass(frozen=True)
class Point:
    latitude: float
    longitude: float


async def geocode(street: str, postal_code: str, city: str, country_code: str) -> Point:
    settings = get_settings()
    if settings.geocoder == "fake":
        return _fake(street, city)
    # Nominatim's usage policy allows one request a second for the whole app.
    await hit("geocode", "nominatim", limit=1, window_seconds=1)
    params = {
        "street": street,
        "postalcode": postal_code,
        "city": city,
        "countrycodes": country_code.lower(),
        "format": "jsonv2",
        "limit": "1",
    }
    headers = {"User-Agent": f"{settings.brand_name}/1.0 (+{settings.app_base_url})"}
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            response = await http.get(
                f"{settings.geocoder_url}/search", params=params, headers=headers
            )
            response.raise_for_status()
            results = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Address lookup is unavailable right now. Try again in a minute.",
        ) from exc
    if not results:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=NOT_FOUND)
    return Point(float(results[0]["lat"]), float(results[0]["lon"]))


def _fake(street: str, city: str) -> Point:
    """Deterministic points around central Riga, for tests and offline development."""
    if street.lower().startswith("nowhere"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=NOT_FOUND)
    digest = hashlib.sha256(f"{street}|{city}".encode()).digest()
    return Point(56.9496 + digest[0] / 25500, 24.1052 + digest[1] / 25500)
