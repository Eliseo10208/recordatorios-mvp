"""Owner-scoped reminder commands and queries."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, time
from typing import cast
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth_service import AuthProblem
from app.db import Reminder, User
from app.pagination import decode_cursor, encode_cursor
from app.reminder_schemas import (
    ReminderCreate,
    ReminderPage,
    ReminderPatch,
    ReminderPublic,
    ScheduleInput,
    SchedulePreview,
    Status,
    WhatsAppStatus,
)
from app.reminder_time import resolve_schedule
from app.whatsapp_settings_service import require_active


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def database_now(db: Session) -> datetime:
    value = db.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database clock unavailable")
    return aware(value)


def preview(db: Session, payload: ScheduleInput) -> SchedulePreview:
    instant, local_date, local_time, resolution = resolve_schedule(
        payload.local_date,
        time.fromisoformat(payload.local_time),
        payload.timezone,
    )
    if instant <= database_now(db):
        raise AuthProblem(422, "Schedule must be in the future")
    return SchedulePreview(
        scheduled_at_utc=instant,
        local_date=local_date,
        local_time=local_time,
        timezone=payload.timezone,
        resolution=resolution,
    )


def public_reminder(row: Reminder) -> ReminderPublic:
    local = aware(row.scheduled_at_utc).astimezone(ZoneInfo(row.timezone))
    return ReminderPublic(
        id=row.id,
        message=row.message,
        scheduled_at_utc=aware(row.scheduled_at_utc),
        local_date=local.date().isoformat(),
        local_time=local.strftime("%H:%M"),
        timezone=row.timezone,
        resolution="exact",
        status=cast(Status, row.status),
        send_whatsapp=row.send_whatsapp,
        whatsapp_status=(
            cast(WhatsAppStatus, row.delivery_attempts[-1].status)
            if row.delivery_attempts
            else None
        ),
        version=row.version,
        created_at=aware(row.created_at),
        fired_at=aware(row.fired_at) if row.fired_at else None,
        canceled_at=aware(row.canceled_at) if row.canceled_at else None,
    )


def create_reminder(
    db: Session, user: User, payload: ReminderCreate, key: UUID
) -> tuple[ReminderPublic, bool]:
    canonical = json.dumps(
        payload.model_dump(
            mode="json",
            exclude={"send_whatsapp"} if not payload.send_whatsapp else None,
        ),
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    existing = db.scalar(
        select(Reminder).where(
            Reminder.user_id == user.id, Reminder.idempotency_key == key
        )
    )
    if existing:
        if existing.create_hash != digest:
            raise AuthProblem(409, "Idempotency key already used")
        return public_reminder(existing), False
    schedule = preview(db, payload)
    if payload.send_whatsapp:
        require_active(db, user.id)
    moment = database_now(db)
    row = Reminder(
        user_id=user.id,
        message=payload.message,
        scheduled_at_utc=schedule.scheduled_at_utc,
        timezone=payload.timezone,
        status="scheduled",
        send_whatsapp=payload.send_whatsapp,
        version=1,
        created_at=moment,
        updated_at=moment,
        idempotency_key=key,
        create_hash=digest,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(Reminder).where(
                Reminder.user_id == user.id, Reminder.idempotency_key == key
            )
        )
        if existing is None:
            raise
        if existing.create_hash != digest:
            raise AuthProblem(409, "Idempotency key already used") from None
        return public_reminder(existing), False
    db.refresh(row)
    result = public_reminder(row)
    result.resolution = schedule.resolution
    return result, True


def owned(db: Session, user: User, reminder_id: UUID, lock: bool = False) -> Reminder:
    query = select(Reminder).where(
        Reminder.id == reminder_id, Reminder.user_id == user.id
    )
    if lock:
        query = query.with_for_update()
    row = db.scalar(query)
    if row is None:
        raise AuthProblem(404, "Reminder not found")
    return row


def edit_reminder(
    db: Session, user: User, reminder_id: UUID, payload: ReminderPatch
) -> ReminderPublic:
    row = owned(db, user, reminder_id, lock=True)
    if row.status != "scheduled" or row.version != payload.expected_version:
        raise AuthProblem(409, "Reminder changed")
    if payload.send_whatsapp is True:
        require_active(db, user.id)
    current = aware(row.scheduled_at_utc).astimezone(ZoneInfo(row.timezone))
    schedule = preview(
        db,
        ScheduleInput(
            local_date=payload.local_date or current.date(),
            local_time=payload.local_time or current.strftime("%H:%M"),
            timezone=payload.timezone or row.timezone,
        ),
    )
    row.message = payload.message if payload.message is not None else row.message
    row.scheduled_at_utc = schedule.scheduled_at_utc
    row.timezone = schedule.timezone
    if payload.send_whatsapp is not None:
        row.send_whatsapp = payload.send_whatsapp
    row.version += 1
    row.updated_at = database_now(db)
    db.commit()
    result = public_reminder(row)
    result.resolution = schedule.resolution
    return result


def cancel_reminder(
    db: Session, user: User, reminder_id: UUID, version: int
) -> ReminderPublic:
    row = owned(db, user, reminder_id, lock=True)
    if row.status != "scheduled" or row.version != version:
        raise AuthProblem(409, "Reminder changed")
    row.status = "canceled"
    row.version += 1
    moment = database_now(db)
    row.canceled_at = moment
    row.updated_at = moment
    db.commit()
    return public_reminder(row)


def list_reminders(
    db: Session, user: User, status: str, limit: int, cursor: str | None
) -> ReminderPage:
    if status == "upcoming":
        query = select(Reminder).where(
            Reminder.user_id == user.id,
            Reminder.status.in_(("scheduled", "processing")),
        )
        column = Reminder.scheduled_at_utc
        ascending = True
    elif status == "fired":
        query = select(Reminder).where(
            Reminder.user_id == user.id, Reminder.status == "fired"
        )
        column = Reminder.fired_at
        ascending = False
    else:
        query = select(Reminder).where(
            Reminder.user_id == user.id, Reminder.status == "canceled"
        )
        column = Reminder.canceled_at
        ascending = False
    if cursor:
        at, item_id = decode_cursor(cursor, status)
        comparison = (
            or_(column > at, and_(column == at, Reminder.id > item_id))
            if ascending
            else or_(column < at, and_(column == at, Reminder.id < item_id))
        )
        query = query.where(comparison)
    query = (
        query.order_by(column.asc(), Reminder.id.asc())
        if ascending
        else query.order_by(column.desc(), Reminder.id.desc())
    )
    rows = list(
        db.scalars(
            query.options(selectinload(Reminder.delivery_attempts)).limit(limit + 1)
        )
    )
    items = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = items[-1]
        at = (
            last.scheduled_at_utc
            if status == "upcoming"
            else last.fired_at
            if status == "fired"
            else last.canceled_at
        )
        if at is not None:
            next_cursor = encode_cursor(status, aware(at), last.id)
    return ReminderPage(
        items=[public_reminder(row) for row in items], next_cursor=next_cursor
    )
