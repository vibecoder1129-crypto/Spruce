"""Consultation forms (slice 13). Owners only: they decide what a venue asks before a visit."""

import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.business.models import Business
from app.business.router import Owner, _owned
from app.identity.deps import Auth, Db
from app.team.models import ConsultationForm, Service
from app.team.schemas import FormIn, FormOut, FormPatch, Question

router = APIRouter(tags=["forms"])

NOT_FOUND = "Form not found."


async def _out(db: AsyncSession, form: ConsultationForm) -> FormOut:
    services = await db.scalars(
        select(Service.id).where(Service.form_id == form.id).order_by(Service.id)
    )
    return FormOut(
        id=form.id,
        name=form.name,
        questions=[Question.model_validate(q) for q in form.questions],
        service_ids=list(services),
    )


async def _owned_form(db: AsyncSession, auth: Auth, form_id: uuid.UUID) -> ConsultationForm:
    form = await db.scalar(
        select(ConsultationForm)
        .join(Business, Business.id == ConsultationForm.business_id)
        .where(ConsultationForm.id == form_id, Business.owner_user_id == auth.user.id)
        .with_for_update(of=ConsultationForm)
    )
    if form is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return form


@router.get("/businesses/{business_id}/forms")
async def list_forms(business_id: uuid.UUID, auth: Owner, db: Db) -> list[FormOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(
        select(ConsultationForm)
        .where(ConsultationForm.business_id == business.id)
        .order_by(ConsultationForm.created_at)
    )
    return [await _out(db, f) for f in rows]


@router.post("/businesses/{business_id}/forms", status_code=status.HTTP_201_CREATED)
async def add_form(business_id: uuid.UUID, body: FormIn, auth: Owner, db: Db) -> FormOut:
    business = await _owned(db, auth, business_id)
    form = ConsultationForm(
        business_id=business.id,
        name=body.name,
        questions=[q.model_dump() for q in body.questions],
    )
    db.add(form)
    await db.flush()
    audit(db, actor=auth.user.id, action="form.create", target_type="form", target_id=form.id)
    await db.commit()
    return await _out(db, form)


@router.patch("/forms/{form_id}")
async def edit_form(form_id: uuid.UUID, body: FormPatch, auth: Owner, db: Db) -> FormOut:
    form = await _owned_form(db, auth, form_id)
    if body.name is not None:
        form.name = body.name
    if body.questions is not None:
        form.questions = [q.model_dump() for q in body.questions]
    if body.service_ids is not None:
        wanted = set(body.service_ids)
        found = set(
            await db.scalars(
                select(Service.id).where(
                    Service.id.in_(wanted), Service.business_id == form.business_id
                )
            )
        )
        if found != wanted:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Service not found.")
        # A service uses one form, so ticking it here moves it from any other.
        await db.execute(
            update(Service)
            .where(Service.form_id == form.id, Service.id.not_in(wanted))
            .values(form_id=None)
        )
        if wanted:
            await db.execute(update(Service).where(Service.id.in_(wanted)).values(form_id=form.id))
    audit(
        db,
        actor=auth.user.id,
        action="form.update",
        target_type="form",
        target_id=form.id,
        fields=sorted(body.model_dump(exclude_none=True)),
    )
    await db.commit()
    return await _out(db, form)


@router.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_form(form_id: uuid.UUID, auth: Owner, db: Db) -> Response:
    form = await _owned_form(db, auth, form_id)
    await db.delete(form)
    audit(db, actor=auth.user.id, action="form.delete", target_type="form", target_id=form_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
