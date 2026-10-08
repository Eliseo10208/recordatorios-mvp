"""Transactional WhatsApp outbox and ambiguous outcome tests on PostgreSQL."""

from __future__ import annotations

import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.db import (
    DeliveryAttempt,
    Notification,
    Reminder,
    User,
    WhatsAppDestination,
    WhatsAppDispatchWindow,
)
from app.reminder_service import delete_reminder
from app.reminder_worker import claim_due, fire_claimed
from app.whatsapp_crypto import decrypt, encrypt, fingerprint, keys
from app.whatsapp_dispatch import (
    _request_payload,
    _save_result,
    claim_pending,
    dispatch_once,
)


def test_deleted_reminder_cancels_pending_and_claimed_send(
    factory: sessionmaker[Session],
) -> None:
    first_id = due(factory)
    first_attempt = fire(factory, first_id)
    with factory() as db:
        reminder = db.get(Reminder, first_id)
        assert reminder
        owner = db.get(User, reminder.user_id)
        assert owner
        delete_reminder(db, owner, first_id, reminder.version)
    with factory() as db:
        saved = db.get(DeliveryAttempt, first_attempt.id)
        assert saved and saved.status == "canceled"

    second_id = due(factory)
    second_attempt = fire(factory, second_id)
    with factory() as db:
        assert second_attempt.id in claim_pending(db)
    with factory() as db:
        reminder = db.get(Reminder, second_id)
        assert reminder
        owner = db.get(User, reminder.user_id)
        assert owner
        delete_reminder(db, owner, second_id, reminder.version)
    with factory() as db:
        assert _request_payload(db, second_attempt.id) is None
        saved = db.get(DeliveryAttempt, second_attempt.id)
        assert saved and saved.status == "canceled"

    third_id = due(factory)
    third_attempt = fire(factory, third_id)
    with factory() as db:
        assert third_attempt.id in claim_pending(db)
    with factory() as db:
        assert _request_payload(db, third_attempt.id) is not None
    with factory() as db:
        reminder = db.get(Reminder, third_id)
        assert reminder
        owner = db.get(User, reminder.user_id)
        assert owner
        delete_reminder(db, owner, third_id, reminder.version)
    with factory() as db:
        _save_result(db, third_attempt.id, ("accepted", "provider-after-delete", None))
        saved = db.get(DeliveryAttempt, third_attempt.id)
        assert saved and saved.status == "accepted"
        assert saved.provider_message_id == "provider-after-delete"


@pytest.fixture
def factory(monkeypatch) -> sessionmaker[Session]:
    url = os.environ.get("TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    if "_test" not in urlsplit(url).path:
        pytest.fail("A named test database is required")
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"z" * 32).decode())
    engine = create_engine(url.replace("postgresql://", "postgresql+psycopg://", 1))
    try:
        with Session(engine) as db:
            owned = (
                select(Reminder.id)
                .join(User)
                .where(User.email_normalized.like("dispatch-%@example.com"))
            )
            db.execute(
                update(DeliveryAttempt)
                .where(
                    DeliveryAttempt.reminder_id.in_(owned),
                    DeliveryAttempt.status.in_(["pending", "sending"]),
                )
                .values(status="canceled", next_attempt_at=None, lease_until=None)
            )
            db.execute(
                update(WhatsAppDispatchWindow).values(
                    attempts=0, window_start=datetime.now(UTC)
                )
            )
            db.commit()
        yield sessionmaker(engine, expire_on_commit=False)
    finally:
        engine.dispose()


def due(factory: sessionmaker[Session]) -> UUID:
    moment = datetime.now(UTC)
    phone = "+52" + str(uuid4().int % 10_000_000_000).zfill(10)
    encryption_key, hash_key = keys()
    with factory() as db:
        user = User(
            email=f"dispatch-{uuid4()}@example.com",
            email_normalized=f"dispatch-{uuid4()}@example.com",
            password_hash="test-only",
            auth_version=0,
            created_at=moment,
        )
        db.add(user)
        db.flush()
        db.add(
            WhatsAppDestination(
                user_id=user.id,
                phone_encrypted=encrypt(phone, encryption_key),
                phone_hash=fingerprint(phone, hash_key),
                masked_number="•••• 5678",
                status="active",
                version=1,
                opted_in_at=moment,
                consent_text_version="v1",
            )
        )
        reminder = Reminder(
            user_id=user.id,
            message="Pagar la tarjeta",
            scheduled_at_utc=moment - timedelta(seconds=1),
            timezone="UTC",
            status="scheduled",
            send_whatsapp=True,
            version=1,
            created_at=moment,
            updated_at=moment,
            idempotency_key=uuid4(),
            create_hash="0" * 64,
        )
        db.add(reminder)
        db.commit()
        return reminder.id


def fire(factory: sessionmaker[Session], reminder_id: UUID) -> DeliveryAttempt:
    with factory() as db:
        assert reminder_id in claim_due(db)
        assert fire_claimed(db, reminder_id)
        attempt = db.scalar(
            select(DeliveryAttempt).where(DeliveryAttempt.reminder_id == reminder_id)
        )
        assert attempt is not None
        return attempt


def client(handler) -> httpx.Client:
    return httpx.Client(
        base_url="https://recordatorios-whatsapp-kxia.onrender.com",
        transport=httpx.MockTransport(handler),
    )


def test_fire_creates_one_private_attempt_and_accepts_once(
    factory: sessionmaker[Session],
) -> None:
    reminder_id = due(factory)
    attempt = fire(factory, reminder_id)
    assert attempt.status == "pending"
    with factory() as db:
        assert db.scalar(
            select(Notification).where(Notification.reminder_id == reminder_id)
        )
        assert db.scalar(
            select(DeliveryAttempt).where(DeliveryAttempt.id == attempt.id)
        )
        assert fire_claimed(db, reminder_id) is False
        reminder = db.get(Reminder, reminder_id)
        assert reminder
        target = db.scalar(
            select(WhatsAppDestination).where(
                WhatsAppDestination.user_id == reminder.user_id
            )
        )
        assert target and target.phone_encrypted
        phone = decrypt(target.phone_encrypted, keys()[0])
    requests: list[httpx.Request] = []

    def accepted(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200, json={"status": "accepted", "messageId": "provider-1"}
        )

    with client(accepted) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 1
        assert dispatch_once(factory, transport, "test-service-token") == 0
    assert len(requests) == 1
    assert requests[0].headers["Idempotency-Key"] == str(attempt.id)
    assert requests[0].headers["Authorization"] == "Bearer test-service-token"
    assert json.loads(requests[0].content) == {
        "phone": phone,
        "message": "Recordatorio: Pagar la tarjeta",
    }
    with factory() as db:
        saved = db.get(DeliveryAttempt, attempt.id)
        assert saved and saved.status == "accepted"
        assert saved.provider_message_id == "provider-1"
        assert phone not in repr(saved.__dict__)


def test_unknown_never_retries_and_expired_lease_is_terminal(
    factory: sessionmaker[Session],
) -> None:
    first = fire(factory, due(factory))
    calls = 0

    def timed_out(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("response lost")

    with client(timed_out) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 1
        assert dispatch_once(factory, transport, "test-service-token") == 0
    assert calls == 1
    with factory() as db:
        assert db.get(DeliveryAttempt, first.id).status == "unknown"

    second = fire(factory, due(factory))
    with factory() as db:
        db.execute(
            update(DeliveryAttempt)
            .where(DeliveryAttempt.id == second.id)
            .values(
                status="sending", lease_until=datetime.now(UTC) - timedelta(seconds=1)
            )
        )
        db.commit()
    with client(timed_out) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 0
    with factory() as db:
        assert db.get(DeliveryAttempt, second.id).status == "unknown"
    assert calls == 1


def test_unavailable_retries_but_changed_number_cancels_pending(
    factory: sessionmaker[Session],
) -> None:
    attempt = fire(factory, due(factory))
    with client(
        lambda _: httpx.Response(503, json={"code": "unavailable"})
    ) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 1
    with factory() as db:
        saved = db.get(DeliveryAttempt, attempt.id)
        assert saved and saved.status == "pending" and saved.attempt_count == 1
        assert saved.next_attempt_at is not None
        reminder = db.get(Reminder, attempt.reminder_id)
        assert reminder
        target = db.scalar(
            select(WhatsAppDestination).where(
                WhatsAppDestination.user_id == reminder.user_id
            )
        )
        assert target
        replacement = "+52" + str(uuid4().int % 10_000_000_000).zfill(10)
        target.phone_hash = fingerprint(replacement, keys()[1])
        target.phone_encrypted = encrypt(replacement, keys()[0])
        saved.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    calls = 0

    def should_not_send(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"status": "accepted", "messageId": "wrong"})

    with client(should_not_send) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 0
    assert calls == 0
    with factory() as db:
        assert db.get(DeliveryAttempt, attempt.id).status == "canceled"


def test_retry_after_and_ambiguous_502(factory: sessionmaker[Session]) -> None:
    first = fire(factory, due(factory))
    before = datetime.now(UTC)
    with client(
        lambda _: httpx.Response(429, headers={"Retry-After": "120"})
    ) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 1
    with factory() as db:
        saved = db.get(DeliveryAttempt, first.id)
        assert saved and saved.status == "pending"
        assert saved.next_attempt_at >= before + timedelta(seconds=120)
    second = fire(factory, due(factory))
    with client(
        lambda _: httpx.Response(502, json={"code": "outcome_unknown"})
    ) as transport:
        assert dispatch_once(factory, transport, "test-service-token") == 1
    with factory() as db:
        assert db.get(DeliveryAttempt, second.id).status == "unknown"


def test_global_dispatch_limit_is_durable(factory: sessionmaker[Session]) -> None:
    attempts = [fire(factory, due(factory)) for _ in range(21)]
    with client(
        lambda _: httpx.Response(200, json={"status": "accepted", "messageId": "ok"})
    ) as transport:
        assert dispatch_once(factory, transport, "test-service-token", limit=50) == 20
        assert dispatch_once(factory, transport, "test-service-token", limit=50) == 0
    with factory() as db:
        statuses = [db.get(DeliveryAttempt, item.id).status for item in attempts]
    assert statuses.count("accepted") == 20
    assert statuses.count("pending") == 1


def test_two_dispatchers_claim_once(factory: sessionmaker[Session]) -> None:
    attempt = fire(factory, due(factory))
    calls = 0

    def accepted(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"status": "accepted", "messageId": "once"})

    with client(accepted) as transport, ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(dispatch_once, factory, transport, "test-service-token")
            for _ in range(2)
        ]
        assert sum(item.result() for item in futures) == 1
    assert calls == 1
    with factory() as db:
        assert db.get(DeliveryAttempt, attempt.id).status == "accepted"


def test_retry_budget_exhausts_after_six_delays(factory: sessionmaker[Session]) -> None:
    attempt = fire(factory, due(factory))
    with client(lambda _: httpx.Response(503)) as transport:
        for number in range(1, 8):
            assert dispatch_once(factory, transport, "test-service-token") == 1
            with factory() as db:
                saved = db.get(DeliveryAttempt, attempt.id)
                assert saved and saved.attempt_count == number
                assert saved.status == ("pending" if number <= 6 else "failed")
                if number <= 6:
                    saved.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
                    db.commit()
