# Slice 10: "Book now" for the venue's website, Instagram and Google

Feature list 7.3: the venue's own link and button. Home already has one booking link and a plain
button snippet (slice 5a). Done when: an owner picks where they'll share the link (their website,
Instagram, Google, Facebook) and gets a link or button for that place, sees the button before
copying it, and Home shows how many online bookings came from each place in the last 30 days.

## Scope

**Database** (migration 0012): `bookings.channel`, null or one of `link` (shared by message,
email or card), `website`, `instagram`, `google`, `facebook`. Null means the customer came through
Spruce itself.

**API**

| What | Who | Notes |
| --- | --- | --- |
| `POST /bookings` | Customer | Optional `channel` (one of the five, anything else 422) |
| `GET /businesses/{id}/channels` | Owner | Online bookings made in the last 30 days, per channel, cancelled ones included |

The channel is only a label for the owner's own counts. It can't change a price, a time or who
may book, so the server accepts what the link says as long as it is one of the five.

Rules the tests cover: the channel is stored and counted; an unknown channel is a 422; walk-ins
and other venues' bookings aren't counted; 401 for visitors, 403 for team members and customers,
404 for another owner's business.

**Web**

- Booking pages keep `?from=` through every step and send it when booking. Unknown values are
  dropped, not sent.
- Home, "Your booking link": a "Where will you share it?" choice (Anywhere, Website, Instagram,
  Google, Facebook). Each place gets its own link (`/b/{id}/book?from=instagram`) and one line on
  where to paste it. Website also shows the button, previewed as it will look, with its code.
- Home: "Where online bookings came from", last 30 days, with a count per place and "Found you on
  Spruce" for the rest. Before the first one it says how to start; a failed load says so.

## Decisions

- No iframe or script widget. The session cookies are SameSite=Lax, so a booking page inside
  another site's frame couldn't log in, and the API and web forbid framing (clickjacking). A link
  that opens Spruce is what works everywhere, Instagram included.
- No "Reserve with Google" integration: that needs Google partner approval. The Google option
  says where the link goes in a Google Business Profile.
