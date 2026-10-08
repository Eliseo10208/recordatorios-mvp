"""PostgreSQL row locking permits exactly one token consumer."""

from __future__ import annotations

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.account_email import consume_link
from app.auth_service import AuthProblem, now_utc
from app.db import AccountToken, User


def test_parallel_reset_consumes_once() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    if "_test" not in urlsplit(url).path:
        pytest.fail("TEST_DATABASE_URL must point to a named test database")
    engine = create_engine(url.replace("postgresql://", "postgresql+psycopg://", 1))
    raw = "test-only-token-" + str(uuid4())
    with Session(engine) as db:
        user = User(
            id=uuid4(),
            email="parallel@example.com",
            email_normalized=f"parallel-{uuid4()}@example.com",
            password_hash="old-hash",
            email_verified_at=None,
            auth_version=0,
            created_at=now_utc(),
        )
        db.add(user)
        db.flush()
        db.add(
            AccountToken(
                id=uuid4(),
                user_id=user.id,
                purpose="reset_password",
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                created_at=now_utc(),
                expires_at=now_utc() + timedelta(minutes=30),
                consumed_at=None,
            )
        )
        db.commit()

    def consume() -> int:
        with Session(engine) as db:
            try:
                consume_link(db, raw, "reset_password", "another correct horse battery")
                return 204
            except AuthProblem as exc:
                return exc.status

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(lambda _index: consume(), range(2))) == [204, 400]
    finally:
        engine.dispose()
