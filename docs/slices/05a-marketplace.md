# Slice 5a: Marketplace discovery

Slice 5 (marketplace and booking) ships as two PRs so each stays reviewable: 5a is discovery,
5b is availability and customer booking.

Specs: LLD 3.2 (Location geography), 4.2 (`GET /businesses`, `GET /businesses/{id}`), 7 (GiST
index); HLD 4.1, 4.2; feature list 2 (Marketplace discovery, Marketplace location browsing,
Location auto-detect, Radius filter, Distance display, Map pin per business, Business storefront)
and 7.2.

Done when: a visitor finds approved venues near them or in a city, sees how far each one is and
where it is on a map, opens a storefront with services, team, hours and a map, and a signed-in
customer saves a venue to their favourites.

## Scope

**Database** (migration 0006)

- `favorites`: (user, business) composite key, `created_at`. Removing a business removes its
  favourites.
- Search uses the existing `locations.geog` column and its GiST index (slice 2). No new index.

**API** (public unless noted)

| Method and path | Notes |
| --- | --- |
| `GET /marketplace/search` | `lat`+`lng` with `radius_km` (10, 25, 50 or 60), and/or `city`, `country`, `category`, `q`; 20 per page with `page`. One result per location, nearest first when a point is given, otherwise by name |
| `GET /marketplace/cities` | Countries and cities that have at least one listed venue, with counts, for browsing |
| `GET /marketplace/businesses/{id}` | Storefront: name, category, locations with address, point, time zone and this week's hours, active services with prices, team |
| `GET /me/favorites` | Customer only |
| `PUT /me/favorites/{business_id}` | Customer only; idempotent |
| `DELETE /me/favorites/{business_id}` | Customer only; idempotent |

Rules the tests cover:

- **Only real, approved venues are public.** A business that is pending, rejected or suspended
  never appears in search, cities or favourites, and its storefront is a 404. A venue with no
  active service isn't listed, because there is nothing to book.
- **Radius:** only 10, 25, 50 and 60 km are accepted (422 otherwise). `lat` and `lng` come
  together. Distance is computed by PostGIS on the geography column (`ST_DWithin`,
  `ST_Distance`), rounded to 0.1 km, never by the client.
- **Hours** on the storefront are the earliest start and latest end of that location's shifts
  for each day of the current week, in the location's time zone. A day with no shifts is
  closed.
- **Favourites:** only customers (owners, staff and admins get 403; signed out is 401). A
  business that isn't public is a 404.
- **No personal data in public responses:** team members appear by display name and title
  only.
- **Rate limit:** search is limited per IP to slow scraping.

**Web**

- `/search`:
  - location: "Use my location" (browser geolocation; it's used automatically when the visitor
    already allowed it) or pick a city from the list; the choice is always changeable;
  - radius dropdown (10, 25, 50, 60 km), category chips, and a name search;
  - result cards with distance ("2.3 km away"), city, the starting price and a save button;
  - an honest empty state: no fake venues;
  - "Show map": an OpenStreetMap map with a pin per venue (Leaflet). It loads only when asked,
    because the tiles come from OpenStreetMap's servers.
- `/b/[id]`, the storefront: name and category, services grouped by category with duration and
  price, the team, this week's hours per location, the address with a map, and a save button.
  "Book" arrives in 5b.
- The home page gets a "Find a venue" entry point and header link.
- `/account` lists the customer's saved venues.
- The privacy notice says that maps load tiles from OpenStreetMap when you open them.

## Decisions

- **Maps load on demand**, so no visitor's IP reaches OpenStreetMap unless they open a map.
  Before launch the tiles move to an EU tile host (slice 9 hosting).
- **No IP geolocation.** It would mean sending visitors' IPs to a third party. Browser location
  (with permission) or a chosen city covers "auto-detect, overridable".
- **Storefront is rendered in the browser** for now, like the rest of the app. Server rendering
  for search engines comes with launch work in slice 9.
- Reviews and portfolio on the storefront arrive with slice 7. Report a business is slice 8.

## Acceptance

- Tests first, including the hidden statuses, the radius values, and the favourite denials.
- Migration up, down, up in CI.
- e2e: an approved venue shows up in a city search and a radius search with its distance, its
  storefront shows services, team and hours, and a customer saves it and sees it on their
  account. axe on `/search` (with and without the map) and the storefront, on desktop and phone.
