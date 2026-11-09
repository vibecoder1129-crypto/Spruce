# Slice 13: Consultation forms and patch tests

Feature list: consultation forms and patch tests. Done when: an owner writes a consultation form
and picks the services that use it; a customer who books one of those services fills it in from
Your bookings before the visit; the person doing the visit (and the owner) reads the answers on
the appointment; and a service marked "needs a patch test" can only be booked online by a
customer whose patch test at that venue was recorded at least 48 hours before the visit and no
more than 6 months before it.

## Scope

**Database** (migration 0014): `consultation_forms` (business, name, questions as JSON),
`services.form_id` (set null if the form is removed), `services.needs_patch_test`,
`form_answers` (one per booking: the questions as asked and the answers, encrypted together),
and `customer_profiles.patch_test_at`.

**API**

| What | Who | Notes |
| --- | --- | --- |
| `GET /businesses/{id}/forms` | Owner | With the services that use each |
| `POST /businesses/{id}/forms` | Owner | Name and 1 to 30 questions (`text` or `yes_no`) |
| `PATCH /forms/{id}` | Owner | Name, questions, and the full list of services that use it |
| `DELETE /forms/{id}` | Owner | Answers already given are kept with their bookings |
| `GET /bookings/{id}/form` | The booking's customer, the owner, the team member doing it | The questions, and the answers once given. Business reads are audited |
| `PUT /bookings/{id}/form` | The booking's customer | Until the visit starts; one answer per question, of the right kind, and `consent: true` |
| `POST /bookings/{id}/patch-test` | Owner, or the team member doing it with "checkout.own" | Records a patch test today for that customer at this venue |
| Services | Owner | `needs_patch_test` on add, edit and list; shown on the venue page |
| `POST /bookings`, reschedule | Customer | 409 when a needed patch test is missing, too recent or too old |

Your bookings say whether a visit's form is `none`, `to_fill` or `filled`; the appointment
details say the same, plus whether the service needs a patch test and when this customer last
had one here. A service uses at most one form, and it applies to every visit for that service
that hasn't been answered yet, including ones booked before the form was linked. "6 months" is
180 days.

Rules the tests cover: forms are made, edited, linked and removed; answers are checked against
the questions (422) and can be changed until the visit starts (409 after, or once cancelled);
answers are seen by the customer, the owner and the person doing the visit, not other team
members (404) or other businesses (404); the patch test window (none, 47 hours before and more than
6 months before all refused; a recorded one works, for booking and moving); guests can't have one recorded
(409); 401 for visitors, 403 for customers and team members on the form settings, 404 for
another owner's forms and services; 422 for a blank name or no questions.

**Web**

- Services: "Consultation forms", to add, rename and remove forms, edit their questions, and
  tick "Used for" services. Each service gets a "Needs a patch test" tick.
- Booking pages: a service that needs a patch test says so before a time is picked.
- Your bookings: "Fill in the form" (or "Change your answers") for an upcoming visit, which opens
  the form page.
- Calendar: an appointment's details show the form's answers (or "Not filled in yet"), the patch
  test date, and "Record patch test today".

## Decisions

- Answers are health information, so they are encrypted, shown only to the owner and the
  person doing the visit, never listed in bulk, and each business read is written to the audit
  log (without the answers). The customer ticks a consent box each time they send them (GDPR
  article 9), and the API refuses answers without it.
- Filling in the form isn't required to book: venues ask for it before the visit, and the
  appointment shows when it's missing. This keeps booking quick on a phone.
- The patch test is only enforced for online bookings. The venue can still book or move a visit
  itself (it may test on the day), and sees the patch test date on the appointment.
- 48 hours and 6 months are fixed, the common rule for tints and dyes. A venue setting can come
  when one asks for different numbers.
