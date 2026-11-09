# Slice 12: Rooms and equipment

Feature list: resources (rooms, machines) as a booking constraint. Done when: an owner adds rooms
or equipment at a location and ticks the services that need one; a time for such a service is
open only when someone on the team and one of its rooms are free; no two visits ever share a room
at once; and the calendar shows which room a visit uses.

## Scope

**Database** (migration 0013): `resources` (business, location, name), `service_resources`
(service, resource), `bookings.resource_id` (set null if the room is removed), and the EXCLUDE
constraint `no_double_resource` on room and time, like `no_double_booking` on staff and time.

**API**

| What | Who | Notes |
| --- | --- | --- |
| `GET /businesses/{id}/resources` | Owner | With the services each is needed for |
| `POST /businesses/{id}/resources` | Owner | Name and one of the business's locations |
| `PATCH /resources/{id}` | Owner | Name, and the full list of services that need it |
| `DELETE /resources/{id}` | Owner | Bookings keep their time; they no longer hold the room |
| Availability, booking, moving, walk-ins | As before | A service linked to rooms needs one free at the person's location |

A service with no rooms linked works as before. One linked only to rooms at another location
can't be booked at this one. When a visit is moved, it keeps its room if that is still free.
The server picks the first free room; the database decides any race (409, "No room or
equipment for this service is free then.").

Rules the tests cover: one room means one visit at a time across the team (availability, customer
booking, walk-ins); two rooms take two; moves and cancellations; rooms at another location don't
count; 401 for visitors, 403 for customers and team members, 404 for another owner's rooms,
services and locations; 422 for a blank name.

**Web**

- Services: "Rooms and equipment", to add, rename, remove and tick "Needed for" services.
- Calendar: an appointment's details show its room or equipment.

## Decisions

- Owners only, like services: rooms shape what can be booked. Team members see the room on the
  appointment.
- A service needs one room of a set, not several at once (a room and a machine). Nothing asked
  for more; it can be added when a venue needs it.
- No archive: removing a room is the way to stop using it. Past bookings keep their times.
