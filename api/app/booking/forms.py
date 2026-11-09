"""A visit's consultation form and patch test (slice 13).

Answers are health information: encrypted, shown only to the customer, the owner and the person
doing the visit, and every business read is audited (without the answers).
"""

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.booking.models import Booking, CustomerProfile, FormAnswers
from app.booking.router import CHANGEABLE, _detail, _visible_booking
from app.booking.schemas import BookingDetail, BookingFormOut, FormAnswersIn
from app.crypto import decrypt, encrypt
from app.identity.deps import Auth, Db, FullySignedIn
from app.identity.models import Role
from app.marketplace.router import Customer
from app.models_base import utcnow
from app.team.models import ConsultationForm, Service
from app.team.schemas import Question

router = APIRouter(tags=["forms"])

CONTEXT = "booking.form"
NO_FORM = "This visit has no consultation form."
NOT_FOUND = "Booking not found."


async def _readable(db: AsyncSession, auth: Auth, booking_id: uuid.UUID) -> tuple[Booking, bool]:
    """The booking, and whether a business reads it. Anyone else gets a 404."""
    if auth.user.role is Role.consumer:
        booking = await db.scalar(
            select(Booking).where(
                Booking.id == booking_id, Booking.consumer_user_id == auth.user.id
            )
        )
        if booking is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
        return booking, False
    booking, actor = await _visible_booking(db, auth, booking_id)
    if actor.staff is not None and booking.staff_id != actor.staff.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return booking, True


async def _asked(db: AsyncSession, booking: Booking) -> tuple[dict[str, Any], FormAnswers | None]:
    """The form as answered, or else as the service asks it now."""
    answers = await db.get(FormAnswers, booking.id)
    if answers is not None:
        saved: dict[str, Any] = json.loads(decrypt(answers.answers_encrypted, CONTEXT))
        return saved, answers
    form = await db.scalar(
        select(ConsultationForm)
        .join(Service, Service.form_id == ConsultationForm.id)
        .where(Service.id == booking.service_id)
    )
    if form is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NO_FORM)
    return {"name": form.name, "questions": form.questions, "answers": None}, None


def _out(asked: dict[str, Any], row: FormAnswers | None) -> BookingFormOut:
    return BookingFormOut(
        name=asked["name"],
        questions=[Question.model_validate(q) for q in asked["questions"]],
        answers=asked["answers"],
        submitted_at=row.submitted_at if row else None,
    )


@router.get("/bookings/{booking_id}/form")
async def read_form(booking_id: uuid.UUID, auth: FullySignedIn, db: Db) -> BookingFormOut:
    booking, business = await _readable(db, auth, booking_id)
    asked, row = await _asked(db, booking)
    if business and row is not None:
        audit(
            db, actor=auth.user.id, action="form.view", target_type="booking", target_id=booking.id
        )
    await db.commit()
    return _out(asked, row)


@router.put("/bookings/{booking_id}/form")
async def answer_form(
    booking_id: uuid.UUID, body: FormAnswersIn, auth: Customer, db: Db
) -> BookingFormOut:
    booking = await db.scalar(
        select(Booking)
        .where(Booking.id == booking_id, Booking.consumer_user_id == auth.user.id)
        .with_for_update()
    )
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    if booking.status not in CHANGEABLE or booking.starts_at <= utcnow():
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="The form can't be changed after the visit starts."
        )
    asked, row = await _asked(db, booking)
    questions = asked["questions"]
    fits = len(body.answers) == len(questions) and all(
        isinstance(a, bool) == (q["kind"] == "yes_no")
        for a, q in zip(body.answers, questions, strict=True)
    )
    if not fits:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Answer each question: yes or no, or in words.",
        )
    asked = {**asked, "answers": body.answers}
    blob = encrypt(json.dumps(asked), CONTEXT)
    if row is None:
        row = FormAnswers(booking_id=booking.id, answers_encrypted=blob, submitted_at=utcnow())
        db.add(row)
    else:
        row.answers_encrypted, row.submitted_at = blob, utcnow()
    audit(db, actor=auth.user.id, action="form.answer", target_type="booking", target_id=booking.id)
    await db.commit()
    return _out(asked, row)


@router.post("/bookings/{booking_id}/patch-test")
async def record_patch_test(booking_id: uuid.UUID, auth: FullySignedIn, db: Db) -> BookingDetail:
    booking, actor = await _visible_booking(db, auth, booking_id)
    if not actor.marks(booking.staff_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can't record this.")
    if booking.consumer_user_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Patch tests are kept for customers who booked with a Spruce account.",
        )
    profile = await db.scalar(
        select(CustomerProfile)
        .where(
            CustomerProfile.business_id == booking.business_id,
            CustomerProfile.consumer_user_id == booking.consumer_user_id,
        )
        .with_for_update()
    )
    if profile is None:
        profile = CustomerProfile(
            business_id=booking.business_id,
            consumer_user_id=booking.consumer_user_id,
            no_show_streak=0,
            completed_count=0,
        )
        db.add(profile)
    profile.patch_test_at = utcnow()
    audit(
        db,
        actor=auth.user.id,
        action="patch_test.record",
        target_type="booking",
        target_id=booking.id,
    )
    await db.commit()
    return await _detail(db, booking)
