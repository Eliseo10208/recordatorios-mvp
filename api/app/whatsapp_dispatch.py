"""Bounded, durable WhatsApp dispatch without holding DB locks over HTTP."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import cast
from uuid import UUID

import httpx
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session, sessionmaker

from app.db import (
    DeliveryAttempt,
    Reminder,
    WhatsAppDestination,
    WhatsAppDispatchWindow,
)
from app.reminder_service import aware, database_now
from app.whatsapp_crypto import decrypt, keys

DELAYS = (30, 60, 120, 240, 480, 960)
TIMEOUT = httpx.Timeout(connect=3, read=25, write=3, pool=3)


def claim_pending(db: Session, limit: int = 5) -> list[UUID]:
    moment = database_now(db)
    db.execute(
        update(DeliveryAttempt)
        .where(
            DeliveryAttempt.status == "sending",
            DeliveryAttempt.lease_until <= moment,
        )
        .values(
            status="unknown",
            lease_until=None,
            last_error_code="lease_expired",
            updated_at=moment,
        )
    )
    db.execute(
        text(
            "INSERT INTO whatsapp_dispatch_windows (key, window_start, attempts) "
            "VALUES ('global', :moment, 0) ON CONFLICT (key) DO NOTHING"
        ),
        {"moment": moment},
    )
    window = db.scalar(
        select(WhatsAppDispatchWindow)
        .where(WhatsAppDispatchWindow.key == "global")
        .with_for_update()
    )
    if window is None:
        raise RuntimeError("Dispatch rate window unavailable")
    if aware(window.window_start) <= moment - timedelta(minutes=1):
        window.window_start = moment
        window.attempts = 0
    allowance = min(limit, max(0, 20 - window.attempts))
    rows = list(
        db.scalars(
            select(DeliveryAttempt)
            .where(
                DeliveryAttempt.status == "pending",
                DeliveryAttempt.next_attempt_at <= moment,
            )
            .order_by(DeliveryAttempt.next_attempt_at, DeliveryAttempt.id)
            .limit(allowance)
            .with_for_update(skip_locked=True)
        )
    )
    for row in rows:
        row.status = "sending"
        row.lease_until = moment + timedelta(seconds=90)
        row.attempt_count += 1
        row.updated_at = moment
    window.attempts += len(rows)
    db.commit()
    return [row.id for row in rows]


def _request_payload(db: Session, attempt_id: UUID) -> tuple[str, str] | None:
    row = db.scalar(
        select(DeliveryAttempt)
        .where(DeliveryAttempt.id == attempt_id)
        .with_for_update()
    )
    if row is None or row.status != "sending":
        db.rollback()
        return None
    reminder = db.get(Reminder, row.reminder_id)
    if reminder is None:
        row.status = "canceled"
        db.commit()
        return None
    target = db.scalar(
        select(WhatsAppDestination)
        .where(WhatsAppDestination.user_id == reminder.user_id)
        .with_for_update()
    )
    if (
        target is None
        or target.status != "active"
        or target.phone_hash != row.destination_key
        or target.phone_encrypted is None
    ):
        row.status = "canceled"
        row.lease_until = None
        row.next_attempt_at = None
        row.updated_at = database_now(db)
        db.commit()
        return None
    encryption_key, _hash_key = keys()
    phone = decrypt(target.phone_encrypted, encryption_key)
    message = f"Recordatorio: {reminder.message}"
    db.commit()
    return phone, message


def _retry_after(response: httpx.Response) -> int | None:
    value = response.headers.get("Retry-After", "")
    try:
        seconds = int(value)
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if date.tzinfo is None:
            date = date.replace(tzinfo=UTC)
        seconds = int((date - datetime.now(UTC)).total_seconds())
    return max(seconds, 1)


def _result(response: httpx.Response) -> tuple[str, str | None, int | None]:
    if response.status_code == 200:
        try:
            data: object = response.json()
        except ValueError:
            return "unknown", "invalid_response", None
        parsed = cast(dict[str, object], data) if isinstance(data, dict) else {}
        message_id = parsed.get("messageId")
        if (
            parsed.get("status") == "accepted"
            and isinstance(message_id, str)
            and message_id
        ):
            return "accepted", message_id, None
        return "unknown", "invalid_response", None
    if response.status_code in (429, 503):
        return (
            "retry",
            "rate_limited" if response.status_code == 429 else "unavailable",
            _retry_after(response),
        )
    if response.status_code in (400, 401):
        return (
            "failed",
            "invalid_request" if response.status_code == 400 else "unauthorized",
            None,
        )
    if response.status_code == 409:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        return (
            ("failed", "idempotency_conflict", None)
            if code == "idempotency_conflict"
            else ("unknown", "outcome_unknown", None)
        )
    return "unknown", "outcome_unknown", None


def _save_result(
    db: Session,
    attempt_id: UUID,
    result: tuple[str, str | None, int | None],
) -> None:
    row = db.scalar(
        select(DeliveryAttempt)
        .where(DeliveryAttempt.id == attempt_id)
        .with_for_update()
    )
    if row is None or row.status != "sending":
        db.rollback()
        return
    status, detail, retry_after = result
    moment = database_now(db)
    if status == "accepted":
        row.provider_message_id = detail
        row.last_error_code = None
        row.next_attempt_at = None
    elif status == "retry" and row.attempt_count <= len(DELAYS):
        delay = retry_after or DELAYS[row.attempt_count - 1]
        # Stable bounded jitter avoids synchronized retries after an outage.
        jitter = (attempt_id.int % 11) / 100
        row.next_attempt_at = moment + timedelta(seconds=delay * (1 + jitter))
        status = "pending"
        row.last_error_code = detail
    else:
        status = "failed" if status == "retry" else status
        row.next_attempt_at = None
        row.last_error_code = detail
    row.status = status
    row.lease_until = None
    row.updated_at = moment
    db.commit()


def dispatch_once(
    factory: sessionmaker[Session], client: httpx.Client, token: str, limit: int = 5
) -> int:
    with factory() as db:
        ids = claim_pending(db, limit)
    sent = 0
    for attempt_id in ids:
        with factory() as db:
            payload = _request_payload(db, attempt_id)
        if payload is None:
            continue
        phone, message = payload
        try:
            response = client.post(
                "/v1/messages",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Idempotency-Key": str(attempt_id),
                },
                json={"phone": phone, "message": message},
                timeout=TIMEOUT,
            )
            result = _result(response)
        except httpx.RequestError:
            result = "unknown", "transport_unknown", None
        with factory() as db:
            _save_result(db, attempt_id, result)
        sent += 1
    return sent
