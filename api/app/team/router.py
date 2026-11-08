"""Services, team, permissions and staff invites (LLD 3.1, 3.2, 4.4, 5.3; HLD 4.6, 9)."""

import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import email as mail
from app.audit import audit
from app.business.models import Business, Location, StaffProfile
from app.business.router import Owner, _owned, _role, _staff_out, service_ids_by_staff
from app.business.schemas import StaffOut
from app.config import get_settings
from app.crypto import (
    decrypt,
    email_index,
    encrypt,
    hash_password,
    hash_token,
    new_token,
    normalize_email,
)
from app.geo import currency_for
from app.identity.deps import Auth, Db, client_ip
from app.identity.models import Role, User
from app.identity.router import EMAIL_CONTEXT, me_out
from app.identity.schemas import TERMS_VERSION, MeOut
from app.identity.sessions import revoke_staff, start_session
from app.models_base import utcnow
from app.ratelimit import hit
from app.team.models import Flag, PermissionGrant, Service, StaffInvite, StaffService
from app.team.schemas import (
    AcceptIn,
    GrantIn,
    InviteIn,
    InvitePreview,
    MyStaffOut,
    MyStaffPatch,
    PermissionOut,
    ServiceIn,
    ServiceOut,
    ServicePatch,
    StaffPatch,
    StaffServicesIn,
    StaffServicesOut,
)

router = APIRouter(tags=["team"])

INVITE_TTL = timedelta(days=7)
INVITE_CONTEXT = "staff_invites.email"
STAFF_NOT_FOUND = "Team member not found."
INVITE_GONE = "This invite has expired or was already used."
EMAIL_TAKEN = "An account with this email already exists. Log in instead."

StaffUser = Annotated[Auth, Depends(_role(Role.staff))]


def _service_out(service: Service) -> ServiceOut:
    return ServiceOut.model_validate(service, from_attributes=True)


async def _owned_staff(db: AsyncSession, auth: Auth, staff_id: uuid.UUID) -> StaffProfile:
    """A staff member of the caller's own business. Anyone else's is a 404."""
    staff = await db.scalar(
        select(StaffProfile)
        .join(Business, Business.id == StaffProfile.business_id)
        .where(StaffProfile.id == staff_id, Business.owner_user_id == auth.user.id)
        .with_for_update(of=StaffProfile)
    )
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=STAFF_NOT_FOUND)
    return staff


# --- services --------------------------------------------------------------------------------


@router.get("/businesses/{business_id}/services")
async def list_services(business_id: uuid.UUID, auth: Owner, db: Db) -> list[ServiceOut]:
    business = await _owned(db, auth, business_id)
    rows = await db.scalars(
        select(Service)
        .where(Service.business_id == business.id)
        .order_by(Service.active.desc(), Service.created_at)
    )
    return [_service_out(s) for s in rows]


@router.post("/businesses/{business_id}/services", status_code=status.HTTP_201_CREATED)
async def add_service(business_id: uuid.UUID, body: ServiceIn, auth: Owner, db: Db) -> ServiceOut:
    business = await _owned(db, auth, business_id)
    country = await db.scalar(
        select(Location.country_code)
        .where(Location.business_id == business.id)
        .order_by(Location.created_at)
        .limit(1)
    )
    if country is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Add a location first.")
    service = Service(business_id=business.id, currency=currency_for(country), **body.model_dump())
    db.add(service)
    await db.flush()
    audit(
        db, actor=auth.user.id, action="service.create", target_type="service", target_id=service.id
    )
    await db.commit()
    return _service_out(service)


@router.patch("/services/{service_id}")
async def edit_service(
    service_id: uuid.UUID, body: ServicePatch, auth: Owner, db: Db
) -> ServiceOut:
    service = await db.scalar(
        select(Service)
        .join(Business, Business.id == Service.business_id)
        .where(Service.id == service_id, Business.owner_user_id == auth.user.id)
        .with_for_update(of=Service)
    )
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Service not found.")
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(service, field, value)
    audit(
        db,
        actor=auth.user.id,
        action="service.update",
        target_type="service",
        target_id=service.id,
        fields=sorted(changes),
    )
    await db.commit()
    return _service_out(service)


# --- staff -----------------------------------------------------------------------------------


@router.patch("/staff/{staff_id}")
async def edit_staff(staff_id: uuid.UUID, body: StaffPatch, auth: Owner, db: Db) -> StaffOut:
    staff = await _owned_staff(db, auth, staff_id)
    if body.location_id is not None:
        location = await db.scalar(
            select(Location.id).where(
                Location.id == body.location_id, Location.business_id == staff.business_id
            )
        )
        if location is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found.")
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(staff, field, value)
    if body.active is False:
        await revoke_staff(db, staff.id)
    audit(
        db,
        actor=auth.user.id,
        action="staff.update",
        target_type="staff",
        target_id=staff.id,
        fields=sorted(changes),
    )
    await db.commit()
    ids = await service_ids_by_staff(db, [staff.id])
    return _staff_out(staff, ids.get(staff.id, []))


@router.put("/staff/{staff_id}/services")
async def assign_services(
    staff_id: uuid.UUID, body: StaffServicesIn, auth: Owner, db: Db
) -> StaffServicesOut:
    staff = await _owned_staff(db, auth, staff_id)
    wanted = set(body.service_ids)
    found = set(
        await db.scalars(
            select(Service.id).where(
                Service.id.in_(wanted), Service.business_id == staff.business_id
            )
        )
    )
    if found != wanted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Service not found.")
    await db.execute(delete(StaffService).where(StaffService.staff_id == staff.id))
    db.add_all(StaffService(staff_id=staff.id, service_id=s) for s in wanted)
    audit(
        db,
        actor=auth.user.id,
        action="staff.services",
        target_type="staff",
        target_id=staff.id,
        count=len(wanted),
    )
    await db.commit()
    return StaffServicesOut(service_ids=sorted(wanted))


# --- permissions (HLD 9, LLD 5.3) ------------------------------------------------------------


async def _active_flags(db: AsyncSession, staff_id: uuid.UUID) -> set[Flag]:
    return set(
        await db.scalars(
            select(PermissionGrant.flag_key).where(
                PermissionGrant.staff_id == staff_id, PermissionGrant.revoked_at.is_(None)
            )
        )
    )


@router.get("/staff/{staff_id}/permissions")
async def list_permissions(staff_id: uuid.UUID, auth: Owner, db: Db) -> list[PermissionOut]:
    staff = await _owned_staff(db, auth, staff_id)
    active = await _active_flags(db, staff.id)
    return [PermissionOut(flag=f, granted=f in active) for f in Flag]


@router.put("/staff/{staff_id}/permissions/{flag}")
async def set_permission(
    staff_id: uuid.UUID, flag: str, body: GrantIn, auth: Owner, db: Db
) -> PermissionOut:
    staff = await _owned_staff(db, auth, staff_id)
    try:
        key = Flag(flag)
    except ValueError:
        # Never-grantable flags (permissions.manage, business.settings, chat.business,
        # shift.manage) are not data: there is nothing to grant.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown permission.") from None
    grant = await db.scalar(
        select(PermissionGrant).where(
            PermissionGrant.staff_id == staff.id,
            PermissionGrant.flag_key == key,
            PermissionGrant.revoked_at.is_(None),
        )
    )
    if body.granted and grant is None:
        db.add(
            PermissionGrant(
                staff_id=staff.id,
                flag_key=key,
                granted_at=utcnow(),
                granted_by_user_id=auth.user.id,
            )
        )
        audit(
            db,
            actor=auth.user.id,
            action="permission.grant",
            target_type="staff",
            target_id=staff.id,
            flag=key.value,
        )
    elif not body.granted and grant is not None:
        # One transaction: the grant, every live session of this employee, and the audit entry.
        grant.revoked_at = utcnow()
        await revoke_staff(db, staff.id)
        audit(
            db,
            actor=auth.user.id,
            action="permission.revoke",
            target_type="staff",
            target_id=staff.id,
            flag=key.value,
        )
    await db.commit()
    return PermissionOut(flag=key, granted=body.granted)


# --- invites ---------------------------------------------------------------------------------


@router.post("/staff/{staff_id}/invite", status_code=status.HTTP_202_ACCEPTED)
async def invite_staff(
    staff_id: uuid.UUID, body: InviteIn, request: Request, auth: Owner, db: Db
) -> Response:
    await hit("invite", str(auth.user.id), limit=30, window_seconds=3600)
    staff = await _owned_staff(db, auth, staff_id)
    if staff.user_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This person already has a login.")
    index = email_index(body.email)
    if await db.scalar(select(User.id).where(User.email_index == index)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    now = utcnow()
    for old in await db.scalars(
        select(StaffInvite).where(
            StaffInvite.staff_id == staff.id,
            StaffInvite.used_at.is_(None),
            StaffInvite.voided_at.is_(None),
        )
    ):
        old.voided_at = now
    token = new_token()
    db.add(
        StaffInvite(
            staff_id=staff.id,
            email_index=index,
            email_encrypted=encrypt(normalize_email(body.email), INVITE_CONTEXT),
            token_hash=hash_token(token),
            expires_at=now + INVITE_TTL,
            invited_by_user_id=auth.user.id,
        )
    )
    business_name = await db.scalar(select(Business.name).where(Business.id == staff.business_id))
    audit(db, actor=auth.user.id, action="staff.invite", target_type="staff", target_id=staff.id)
    await db.commit()
    settings = get_settings()
    await mail.send(
        mail.Email(
            to=normalize_email(body.email),
            subject=f"You're invited to join {business_name} on {settings.brand_name}",
            text=(
                f"{business_name} added you to their team on {settings.brand_name}.\n\n"
                f"Set your password to sign in:\n\n{settings.app_base_url}/invite/{token}\n\n"
                "The link works for 7 days."
            ),
        )
    )
    return Response(status_code=status.HTTP_202_ACCEPTED)


async def _open_invite(db: AsyncSession, token: str) -> StaffInvite:
    invite = await db.scalar(
        select(StaffInvite)
        .where(
            StaffInvite.token_hash == hash_token(token),
            StaffInvite.used_at.is_(None),
            StaffInvite.voided_at.is_(None),
            StaffInvite.expires_at > utcnow(),
        )
        .with_for_update()
    )
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=INVITE_GONE)
    return invite


@router.get("/invites/{token}")
async def preview_invite(token: str, request: Request, db: Db) -> InvitePreview:
    await hit("invite-view", client_ip(request), limit=60, window_seconds=3600)
    invite = await _open_invite(db, token)
    row = (
        await db.execute(
            select(Business.name, StaffProfile.display_name)
            .join(StaffProfile, StaffProfile.business_id == Business.id)
            .where(StaffProfile.id == invite.staff_id)
        )
    ).one()
    await db.rollback()
    return InvitePreview(business_name=row[0], display_name=row[1])


@router.post("/invites/{token}/accept", status_code=status.HTTP_201_CREATED)
async def accept_invite(
    token: str, body: AcceptIn, request: Request, response: Response, db: Db
) -> MeOut:
    await hit("signup", client_ip(request), limit=10, window_seconds=3600)
    invite = await _open_invite(db, token)
    staff = await db.scalar(
        select(StaffProfile).where(StaffProfile.id == invite.staff_id).with_for_update()
    )
    if staff is None or staff.user_id is not None or not staff.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=INVITE_GONE)
    if await db.scalar(select(User.id).where(User.email_index == invite.email_index)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=EMAIL_TAKEN)
    now = utcnow()
    user = User(
        email_index=invite.email_index,
        email_encrypted=encrypt(decrypt(invite.email_encrypted, INVITE_CONTEXT), EMAIL_CONTEXT),
        # Opening the emailed link proves the address.
        email_verified_at=now,
        password_hash=hash_password(body.password),
        role=Role.staff,
        terms_version=TERMS_VERSION,
        terms_accepted_at=now,
    )
    db.add(user)
    await db.flush()
    staff.user_id = user.id
    invite.used_at = now
    await db.flush()
    session = await start_session(db, user, response)
    audit(db, actor=user.id, action="staff.accept", target_type="staff", target_id=staff.id)
    await db.commit()
    return me_out(Auth(session, user))


# --- the staff member's own page -------------------------------------------------------------


async def _me(db: AsyncSession, auth: Auth) -> StaffProfile:
    staff = await db.scalar(
        select(StaffProfile).where(
            StaffProfile.user_id == auth.user.id, StaffProfile.active.is_(True)
        )
    )
    if staff is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You're no longer on a team.")
    return staff


async def _my_out(db: AsyncSession, staff: StaffProfile) -> MyStaffOut:
    business_name, location_name = (
        await db.execute(
            select(Business.name, Location.name)
            .join(Location, Location.business_id == Business.id)
            .where(Business.id == staff.business_id, Location.id == staff.location_id)
        )
    ).one()
    services = await db.scalars(
        select(Service.name)
        .join(StaffService, StaffService.service_id == Service.id)
        .where(StaffService.staff_id == staff.id, Service.active.is_(True))
        .order_by(Service.name)
    )
    active = await _active_flags(db, staff.id)
    return MyStaffOut(
        id=staff.id,
        display_name=staff.display_name,
        title=staff.title,
        business_name=business_name,
        location_name=location_name,
        services=list(services),
        permissions=[f for f in Flag if f in active],
    )


@router.get("/me/staff")
async def my_staff(auth: StaffUser, db: Db) -> MyStaffOut:
    return await _my_out(db, await _me(db, auth))


@router.patch("/me/staff")
async def edit_my_staff(body: MyStaffPatch, auth: StaffUser, db: Db) -> MyStaffOut:
    staff = await _me(db, auth)
    changes = body.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(staff, field, value)
    audit(
        db,
        actor=auth.user.id,
        action="staff.self_update",
        target_type="staff",
        target_id=staff.id,
        fields=sorted(changes),
    )
    await db.commit()
    return await _my_out(db, staff)
