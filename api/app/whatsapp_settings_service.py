"""Owner-scoped destination consent and opt-out rules."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth_service import AuthProblem, rate_hit, rate_key
from app.db import DeliveryAttempt, Reminder, User, WhatsAppDestination
from app.settings import Settings
from app.whatsapp_crypto import (
    available,
    enabled,
    encrypt,
    fingerprint,
    keys,
    normalize,
)
from app.whatsapp_schemas import (
    CONSENT_TEXT,
    CONSENT_VERSION,
    DestinationInput,
    DestinationPublic,
)


def destination(
    db: Session, user_id: UUID, lock: bool = False
) -> WhatsAppDestination | None:
    query = select(WhatsAppDestination).where(WhatsAppDestination.user_id == user_id)
    if lock:
        query = query.with_for_update()
    return db.scalar(query)


def database_now(db: Session) -> datetime:
    value = db.scalar(select(func.now()))
    if value is None:
        raise RuntimeError("Database clock unavailable")
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def active_destination(db: Session, user_id: UUID) -> WhatsAppDestination | None:
    row = destination(db, user_id)
    return row if row and row.status == "active" else None


def require_active(db: Session, user_id: UUID) -> None:
    if not available() or active_destination(db, user_id) is None:
        raise AuthProblem(422, "Active WhatsApp destination required")


def public_destination(row: WhatsAppDestination | None) -> DestinationPublic:
    active = row is not None and row.status == "active"
    return DestinationPublic(
        available=available(),
        active=active,
        masked_number=row.masked_number if active and row else None,
        opted_in_at=row.opted_in_at if active and row else None,
        consent_text_version=row.consent_text_version if active and row else None,
        consent_text=CONSENT_TEXT,
    )


def _change_limit(db: Session, settings: Settings, user_id: UUID) -> None:
    key = rate_key(settings, "whatsapp-destination", str(user_id))
    if rate_hit(db, key, timedelta(hours=1)) > 5:
        raise AuthProblem(429, "Too many destination changes")


def _cancel_pending(db: Session, user_id: UUID, old_hash: str) -> None:
    reminder_ids = select(Reminder.id).where(Reminder.user_id == user_id)
    db.execute(
        update(DeliveryAttempt)
        .where(
            DeliveryAttempt.reminder_id.in_(reminder_ids),
            DeliveryAttempt.destination_key == old_hash,
            DeliveryAttempt.status == "pending",
        )
        .values(status="canceled", next_attempt_at=None, updated_at=database_now(db))
    )


def save_destination(
    db: Session, user: User, settings: Settings, body: DestinationInput
) -> DestinationPublic:
    if not enabled():
        raise AuthProblem(503, "WhatsApp is not configured")
    encryption_key, hash_key = keys()
    phone = normalize(body.phone)
    digest = fingerprint(phone, hash_key)
    _change_limit(db, settings, user.id)
    row = destination(db, user.id, lock=True)
    moment = database_now(db)
    if row is None:
        row = WhatsAppDestination(user_id=user.id, status="active", version=1)
        db.add(row)
    elif row.status == "active" and row.phone_hash != digest:
        _cancel_pending(db, user.id, row.phone_hash or "")
        row.version += 1
    elif row.status != "active":
        row.version += 1
    row.phone_encrypted = encrypt(phone, encryption_key)
    row.phone_hash = digest
    row.masked_number = f"•••• {phone[-4:]}"
    row.status = "active"
    row.opted_in_at = moment
    row.consent_text_version = CONSENT_VERSION
    row.disabled_at = None
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AuthProblem(409, "Phone already active") from exc
    return public_destination(row)


def disable_destination(db: Session, user: User, settings: Settings) -> None:
    current = destination(db, user.id)
    if current is None or current.status != "active":
        return
    _change_limit(db, settings, user.id)
    row = destination(db, user.id, lock=True)
    if row is None or row.status != "active":
        return
    if row.phone_hash:
        _cancel_pending(db, user.id, row.phone_hash)
    moment = database_now(db)
    row.phone_encrypted = None
    row.phone_hash = None
    row.masked_number = None
    row.status = "disabled"
    row.version += 1
    row.disabled_at = moment
    db.execute(
        update(Reminder)
        .where(
            Reminder.user_id == user.id,
            Reminder.status == "scheduled",
            Reminder.send_whatsapp.is_(True),
        )
        .values(send_whatsapp=False, version=Reminder.version + 1, updated_at=moment)
    )
    db.commit()
