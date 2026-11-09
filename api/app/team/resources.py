"""Rooms and equipment (slice 12). Owners only: like services, they shape what can be booked."""

import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import audit
from app.business.models import Business, Location
from app.business.router import Owner, _owned
from app.identity.deps import Auth, Db
from app.team.models import Resource, Service, ServiceResource
from app.team.schemas import ResourceIn, ResourceOut, ResourcePatch

router = APIRouter(tags=["resources"])

NOT_FOUND = "Room or equipment not found."


async def _out(db: AsyncSession, resource: Resource) -> ResourceOut:
    services = await db.scalars(
        select(ServiceResource.service_id)
        .where(ServiceResource.resource_id == resource.id)
        .order_by(ServiceResource.service_id)
    )
    return ResourceOut(
        id=resource.id,
        location_id=resource.location_id,
        name=resource.name,
        service_ids=list(services),
    )


async def _owned_resource(db: AsyncSession, auth: Auth, resource_id: uuid.UUID) -> Resource:
    resource = await db.scalar(
        select(Resource)
        .join(Business, Business.id == Resource.business_id)
        .where(Resource.id == resource_id, Business.owner_user_id == auth.user.id)
        .with_for_update(of=Resource)
    )
    if resource is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=NOT_FOUND)
    return resource


@router.get("/businesses/{business_id}/resources")
async def list_resources(business_id: uuid.UUID, auth: Owner, db: Db) -> list[ResourceOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(
        select(Resource).where(Resource.business_id == business.id).order_by(Resource.created_at)
    )
    return [await _out(db, r) for r in rows]


@router.post("/businesses/{business_id}/resources", status_code=status.HTTP_201_CREATED)
async def add_resource(
    business_id: uuid.UUID, body: ResourceIn, auth: Owner, db: Db
) -> ResourceOut:
    business = await _owned(db, auth, business_id)
    place = await db.scalar(
        select(Location.id).where(
            Location.id == body.location_id, Location.business_id == business.id
        )
    )
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found.")
    resource = Resource(business_id=business.id, location_id=place, name=body.name)
    db.add(resource)
    await db.flush()
    audit(
        db,
        actor=auth.user.id,
        action="resource.create",
        target_type="resource",
        target_id=resource.id,
    )
    await db.commit()
    return await _out(db, resource)


@router.patch("/resources/{resource_id}")
async def edit_resource(
    resource_id: uuid.UUID, body: ResourcePatch, auth: Owner, db: Db
) -> ResourceOut:
    resource = await _owned_resource(db, auth, resource_id)
    if body.name is not None:
        resource.name = body.name
    if body.service_ids is not None:
        wanted = set(body.service_ids)
        found = set(
            await db.scalars(
                select(Service.id).where(
                    Service.id.in_(wanted), Service.business_id == resource.business_id
                )
            )
        )
        if found != wanted:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Service not found.")
        await db.execute(delete(ServiceResource).where(ServiceResource.resource_id == resource.id))
        db.add_all(ServiceResource(service_id=s, resource_id=resource.id) for s in wanted)
    audit(
        db,
        actor=auth.user.id,
        action="resource.update",
        target_type="resource",
        target_id=resource.id,
        fields=sorted(body.model_dump(exclude_none=True)),
    )
    await db.commit()
    return await _out(db, resource)


@router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_resource(resource_id: uuid.UUID, auth: Owner, db: Db) -> Response:
    resource = await _owned_resource(db, auth, resource_id)
    await db.delete(resource)
    audit(
        db,
        actor=auth.user.id,
        action="resource.delete",
        target_type="resource",
        target_id=resource_id,
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
