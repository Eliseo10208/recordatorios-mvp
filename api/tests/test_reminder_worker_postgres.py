"""Real PostgreSQL tests for claims, recovery, and one internal notice."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, func, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.db import Notification, Reminder, User
from app.reminder_service import delete_reminder
from app.reminder_worker import claim_due, fire_claimed, run_once


@pytest.fixture
def factory() -> sessionmaker[Session]:
    url = os.environ.get("TEST_DATABASE_URL", "")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    if "_test" not in urlsplit(url).path:
        pytest.fail("Worker integration tests require a named test database")
    engine = create_engine(url.replace("postgresql://", "postgresql+psycopg://", 1))
    try:
        yield sessionmaker(engine, expire_on_commit=False)
    finally:
        engine.dispose()


def due_reminder(factory: sessionmaker[Session]) -> UUID:
    moment = datetime.now(UTC)
    user = User(
        email=f"worker-{uuid4()}@example.com",
        email_normalized=f"worker-{uuid4()}@example.com",
        password_hash="test-only",
        email_verified_at=None,
        auth_version=0,
        created_at=moment,
    )
    with factory() as db:
        db.add(user)
        db.flush()
        reminder = Reminder(
            user_id=user.id,
            message="Worker integration test",
            scheduled_at_utc=moment - timedelta(seconds=1),
            timezone="UTC",
            status="scheduled",
            send_whatsapp=False,
            version=1,
            created_at=moment,
            updated_at=moment,
            idempotency_key=uuid4(),
            create_hash="0" * 64,
        )
        db.add(reminder)
        db.commit()
        return reminder.id


def test_two_workers_create_one_notice(factory: sessionmaker[Session]) -> None:
    reminder_id = due_reminder(factory)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _index: run_once(factory), range(2)))
    with factory() as db:
        row = db.get(Reminder, reminder_id)
        assert row and row.status == "fired"
        assert row.fired_at is not None
        assert (
            db.scalar(
                select(func.count(Notification.id)).where(
                    Notification.reminder_id == reminder_id
                )
            )
            == 1
        )
        notice = db.scalar(
            select(Notification).where(Notification.reminder_id == reminder_id)
        )
        assert notice and notice.body == "Worker integration test"
        assert run_once(factory) == 0


def test_expired_claim_recovers_after_crash(factory: sessionmaker[Session]) -> None:
    reminder_id = due_reminder(factory)
    with factory() as db:
        assert reminder_id in claim_due(db)
    with factory() as db:
        row = db.get(Reminder, reminder_id)
        assert row and row.status == "processing"
        db.execute(
            update(Reminder)
            .where(Reminder.id == reminder_id)
            .values(lease_until=datetime.now(UTC) - timedelta(seconds=1))
        )
        db.commit()
    with factory() as db:
        assert reminder_id in claim_due(db)
        assert fire_claimed(db, reminder_id) is True
        assert fire_claimed(db, reminder_id) is False
    with factory() as db:
        assert (
            db.scalar(
                select(func.count(Notification.id)).where(
                    Notification.reminder_id == reminder_id
                )
            )
            == 1
        )


def test_delete_lock_excludes_concurrent_worker_claim(
    factory: sessionmaker[Session],
) -> None:
    reminder_id = due_reminder(factory)
    with factory() as db:
        row = db.scalar(
            select(Reminder).where(Reminder.id == reminder_id).with_for_update()
        )
        assert row is not None
        owner = db.get(User, row.user_id)
        assert owner is not None
        with ThreadPoolExecutor(max_workers=1) as pool:
            assert pool.submit(run_once, factory).result(timeout=10) == 0
        delete_reminder(db, owner, reminder_id, row.version)
    with factory() as db:
        assert run_once(factory) == 0
        saved = db.get(Reminder, reminder_id)
        assert saved and saved.deleted_at is not None
        assert (
            db.scalar(
                select(func.count(Notification.id)).where(
                    Notification.reminder_id == reminder_id
                )
            )
            == 0
        )
