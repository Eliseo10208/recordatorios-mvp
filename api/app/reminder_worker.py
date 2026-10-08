"""Durable PostgreSQL claims and idempotent internal delivery."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from app.db import DeliveryAttempt, Notification, Reminder, WhatsAppDestination
from app.reminder_service import database_now


def claim_due(db: Session, limit: int = 50, lease_seconds: int = 90) -> list[UUID]:
    moment = database_now(db)
    rows = list(
        db.scalars(
            select(Reminder)
            .where(
                Reminder.deleted_at.is_(None),
                or_(
                    (Reminder.status == "scheduled")
                    & (Reminder.scheduled_at_utc <= moment),
                    (Reminder.status == "processing")
                    & (Reminder.lease_until <= moment),
                ),
            )
            .order_by(Reminder.scheduled_at_utc, Reminder.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    for row in rows:
        row.status = "processing"
        row.lease_until = moment + timedelta(seconds=lease_seconds)
        row.updated_at = moment
    db.commit()
    return [row.id for row in rows]


def fire_claimed(db: Session, reminder_id: UUID) -> bool:
    row = db.scalar(
        select(Reminder).where(Reminder.id == reminder_id).with_for_update()
    )
    if row is None or row.deleted_at is not None or row.status != "processing":
        db.rollback()
        return False
    moment = database_now(db)
    if row.lease_until is None or row.lease_until < moment:
        db.rollback()
        return False
    existing = db.scalar(select(Notification).where(Notification.reminder_id == row.id))
    if existing is None:
        db.add(
            Notification(
                user_id=row.user_id,
                reminder_id=row.id,
                title="Recordatorio",
                body=row.message,
                created_at=moment,
                read_at=None,
            )
        )
    if row.send_whatsapp:
        target = db.scalar(
            select(WhatsAppDestination)
            .where(WhatsAppDestination.user_id == row.user_id)
            .with_for_update()
        )
        if target and target.status == "active" and target.phone_hash:
            attempt = db.scalar(
                select(DeliveryAttempt).where(
                    DeliveryAttempt.reminder_id == row.id,
                    DeliveryAttempt.channel == "whatsapp",
                    DeliveryAttempt.destination_key == target.phone_hash,
                )
            )
            if attempt is None:
                db.add(
                    DeliveryAttempt(
                        reminder_id=row.id,
                        channel="whatsapp",
                        destination_key=target.phone_hash,
                        status="pending",
                        attempt_count=0,
                        next_attempt_at=moment,
                        created_at=moment,
                        updated_at=moment,
                    )
                )
        else:
            row.send_whatsapp = False
    row.status = "fired"
    row.fired_at = moment
    row.lease_until = None
    row.updated_at = moment
    row.version += 1
    db.commit()
    return True


def run_once(
    factory: sessionmaker[Session], limit: int = 50, lease_seconds: int = 90
) -> int:
    with factory() as db:
        ids = claim_due(db, limit, lease_seconds)
    processed = 0
    for reminder_id in ids:
        with factory() as db:
            processed += int(fire_claimed(db, reminder_id))
    return processed
