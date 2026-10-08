"""Account links remain single use and a reset invalidates every session."""

from dataclasses import replace
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient

from app import account_email, account_email_routes, main
from app.account_email import EmailMessage
from app.auth_service import rate_hit, rate_key
from app.db import get_db
from app.settings import get_settings

BASE = "/api/v1/auth"
PASSWORD = "correct horse battery staple"
NEW_PASSWORD = "another correct horse battery"


def enabled(client: TestClient, monkeypatch) -> list[EmailMessage]:
    settings = main.app.dependency_overrides[get_settings]()
    main.app.dependency_overrides[get_settings] = lambda: replace(
        settings,
        account_email_enabled=True,
        resend_api_key="test-key",
        resend_from_email="Recordatorios <no-reply@example.com>",
        web_base_url="https://recordatorios-web-one.vercel.app",
    )
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        main, "send_email", lambda _settings, message: sent.append(message)
    )
    monkeypatch.setattr(
        account_email_routes,
        "send_email",
        lambda _settings, message: sent.append(message),
    )
    return sent


def token_from(message: EmailMessage) -> str:
    link = message.text.split(" ")[5].split("\n")[0]
    return parse_qs(urlsplit(link).fragment)["token"][0]


def test_verification_link_and_replay(client: TestClient, monkeypatch) -> None:
    sent = enabled(client, monkeypatch)
    registered = client.post(
        f"{BASE}/register", json={"email": "verify@example.com", "password": PASSWORD}
    )
    assert registered.status_code == 201
    assert len(sent) == 1
    token = token_from(sent[0])
    assert client.post(f"{BASE}/verify-email", json={"token": token}).status_code == 204
    assert client.post(f"{BASE}/verify-email", json={"token": token}).status_code == 400
    logged_in = client.post(
        f"{BASE}/login", json={"email": "verify@example.com", "password": PASSWORD}
    )
    assert logged_in.json()["user"]["email_verified"] is True


def test_recovery_generic_and_revokes_sessions(client: TestClient, monkeypatch) -> None:
    sent = enabled(client, monkeypatch)
    client.post(
        f"{BASE}/register", json={"email": "reset@example.com", "password": PASSWORD}
    )
    old = client.post(
        f"{BASE}/login", json={"email": "reset@example.com", "password": PASSWORD}
    ).json()
    other = client.post(
        f"{BASE}/login", json={"email": "reset@example.com", "password": PASSWORD}
    ).json()
    verify_token = token_from(sent[0])
    unknown = client.post(
        f"{BASE}/forgot-password", json={"email": "missing@example.com"}
    )
    known = client.post(f"{BASE}/forgot-password", json={"email": "reset@example.com"})
    assert unknown.status_code == known.status_code == 202
    assert unknown.content == known.content
    assert len(sent) == 2
    token = token_from(sent[-1])
    assert (
        client.post(
            f"{BASE}/reset-password",
            json={"token": token, "new_password": NEW_PASSWORD},
        ).status_code
        == 204
    )
    assert (
        client.post(
            f"{BASE}/reset-password",
            json={"token": token, "new_password": NEW_PASSWORD},
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"{BASE}/me", headers={"Authorization": f"Bearer {old['access_token']}"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": old["refresh_token"]}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": other["refresh_token"]}
        ).status_code
        == 401
    )
    assert (
        client.post(f"{BASE}/verify-email", json={"token": verify_token}).status_code
        == 400
    )
    assert (
        client.post(
            f"{BASE}/login", json={"email": "reset@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    new = client.post(
        f"{BASE}/login", json={"email": "reset@example.com", "password": NEW_PASSWORD}
    )
    assert new.status_code == 200
    assert new.json()["user"]["email_verified"] is True


def test_resend_requires_session_and_is_limited(
    client: TestClient, monkeypatch
) -> None:
    sent = enabled(client, monkeypatch)
    client.post(
        f"{BASE}/register", json={"email": "resend@example.com", "password": PASSWORD}
    )
    assert client.post(f"{BASE}/resend-verification", json={}).status_code == 401
    old = client.post(
        f"{BASE}/login", json={"email": "resend@example.com", "password": PASSWORD}
    ).json()
    for _ in range(4):
        assert (
            client.post(
                f"{BASE}/resend-verification",
                json={},
                headers={"Authorization": f"Bearer {old['access_token']}"},
            ).status_code
            == 202
        )
    assert len(sent) == 3


def test_expired_link_is_rejected(client: TestClient, monkeypatch) -> None:
    sent = enabled(client, monkeypatch)
    client.post(
        f"{BASE}/register", json={"email": "expired@example.com", "password": PASSWORD}
    )
    token = token_from(sent[0])
    original_now = account_email.now_utc
    monkeypatch.setattr(
        account_email, "now_utc", lambda: original_now() + timedelta(days=2)
    )
    assert client.post(f"{BASE}/verify-email", json={"token": token}).status_code == 400


def test_resend_retry_keeps_payload_and_key(client: TestClient, monkeypatch) -> None:
    enabled(client, monkeypatch)
    settings = main.app.dependency_overrides[get_settings]()
    seen: list[tuple[bytes, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.content, request.headers.get("Idempotency-Key")))
        return httpx.Response(503 if len(seen) == 1 else 200, json={"id": "fake"})

    original_client = httpx.Client
    monkeypatch.setattr(
        account_email.httpx,
        "Client",
        lambda **_kwargs: original_client(transport=httpx.MockTransport(handler)),
    )
    message = EmailMessage("example@example.com", "Test", "Link", "fixed-key")
    account_email.send_email(settings, message)
    assert len(seen) == 2
    assert seen[0] == seen[1]


def test_provider_timeout_is_not_retried(client: TestClient, monkeypatch) -> None:
    enabled(client, monkeypatch)
    settings = main.app.dependency_overrides[get_settings]()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("simulated", request=request)

    original_client = httpx.Client
    monkeypatch.setattr(
        account_email.httpx,
        "Client",
        lambda **_kwargs: original_client(transport=httpx.MockTransport(handler)),
    )
    account_email.send_email(
        settings, EmailMessage("example@example.com", "Test", "Link", "fixed-key")
    )
    assert calls == 1


def test_daily_cap_stops_new_mail(client: TestClient, monkeypatch) -> None:
    sent = enabled(client, monkeypatch)
    settings = main.app.dependency_overrides[get_settings]()
    session_generator = main.app.dependency_overrides[get_db]()
    db = next(session_generator)
    try:
        for _ in range(80):
            rate_hit(
                db,
                rate_key(settings, "account-email-daily", "global"),
                timedelta(days=1),
            )
    finally:
        session_generator.close()
    response = client.post(
        f"{BASE}/register", json={"email": "capped@example.com", "password": PASSWORD}
    )
    assert response.status_code == 201
    assert sent == []
