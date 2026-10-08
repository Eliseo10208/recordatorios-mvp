"""PostgreSQL checks for migration-backed concurrency semantics."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import get_db
from app.main import app
from app.settings import Settings, get_settings


def test_parallel_refresh_returns_one_successor() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    parsed = urlsplit(url)
    if "_test" not in parsed.path:
        pytest.fail("TEST_DATABASE_URL must point to a named test database")
    engine = create_engine(url.replace("postgresql://", "postgresql+psycopg://", 1))
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings = Settings(
        database_url=url,
        jwt_private_key=private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode(),
        jwt_public_key=private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        .decode(),
        jwt_kid="pg-test",
        jwt_issuer="recordatorios-test",
        jwt_audience="recordatorios-web-test",
        refresh_secret=f"postgres-test-only-refresh-secret-{uuid4()}",
    )

    def test_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        email = f"parallel-{uuid4()}@example.com"
        password = "correct horse battery staple"
        with TestClient(app) as client:
            assert (
                client.post(
                    "/api/v1/auth/register", json={"email": email, "password": password}
                ).status_code
                == 201
            )
            login = client.post(
                "/api/v1/auth/login", json={"email": email, "password": password}
            ).json()

            def renew():
                return client.post(
                    "/api/v1/auth/refresh",
                    json={"refresh_token": login["refresh_token"]},
                )

            with ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _i: renew(), range(2)))
            assert [response.status_code for response in responses] == [200, 200]
            assert (
                responses[0].json()["refresh_token"]
                == responses[1].json()["refresh_token"]
            )
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
