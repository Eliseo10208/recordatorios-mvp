"""WhatsApp destination and reminder opt-in HTTP contract tests."""

from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

PASSWORD = "correct horse battery staple"
BASE = "/api/v1"


def auth(client: TestClient, email: str) -> dict[str, str]:
    assert (
        client.post(
            f"{BASE}/auth/register", json={"email": email, "password": PASSWORD}
        ).status_code
        == 201
    )
    result = client.post(
        f"{BASE}/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert result.status_code == 200
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def payload(send_whatsapp: bool = False) -> dict[str, object]:
    future = datetime.now(UTC) + timedelta(days=1)
    return {
        "message": "Pagar la tarjeta",
        "local_date": future.strftime("%Y-%m-%d"),
        "local_time": future.strftime("%H:%M"),
        "timezone": "UTC",
        "send_whatsapp": send_whatsapp,
    }


def test_destination_consent_is_private_and_required(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"x" * 32).decode())
    alice = auth(client, "wa-alice@example.com")
    bob = auth(client, "wa-bob@example.com")
    path = f"{BASE}/notification-settings/whatsapp"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=alice).json()["active"] is False
    assert (
        client.put(
            path, headers=alice, json={"phone": "+525512345678", "consent": False}
        ).status_code
        == 422
    )
    assert (
        client.put(
            path, headers=alice, json={"phone": "5512345678", "consent": True}
        ).status_code
        == 422
    )
    created = client.put(
        path, headers=alice, json={"phone": "+52 55 1234 5678", "consent": True}
    )
    assert created.status_code == 200
    assert created.json()["masked_number"].endswith("5678")
    assert "+525512345678" not in created.text
    assert created.json()["consent_text_version"] == "v1"
    assert client.get(path, headers=bob).json()["active"] is False
    assert (
        client.put(
            path, headers=bob, json={"phone": "+5215512345678", "consent": True}
        ).status_code
        == 409
    )
    assert client.delete(path, headers=alice).status_code == 204
    for _ in range(6):
        assert client.delete(path, headers=alice).status_code == 204
    assert (
        client.put(
            path, headers=bob, json={"phone": "+5215512345678", "consent": True}
        ).status_code
        == 200
    )


def test_reminder_opt_in_requires_active_destination(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"y" * 32).decode())
    owner = auth(client, "wa-reminder@example.com")
    headers = {**owner, "Idempotency-Key": str(uuid4())}
    assert (
        client.post(
            f"{BASE}/reminders", headers=headers, json=payload(True)
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"{BASE}/notification-settings/whatsapp",
            headers=owner,
            json={"phone": "+525512345678", "consent": True},
        ).status_code
        == 200
    )
    created = client.post(f"{BASE}/reminders", headers=headers, json=payload(True))
    assert created.status_code == 201
    assert created.json()["send_whatsapp"] is True
    assert created.json()["whatsapp_status"] is None
    reminder_id = created.json()["id"]
    assert (
        client.delete(
            f"{BASE}/notification-settings/whatsapp", headers=owner
        ).status_code
        == 204
    )
    changed = client.get(f"{BASE}/reminders/{reminder_id}", headers=owner)
    assert changed.json()["send_whatsapp"] is False
    assert changed.json()["version"] == 2


def test_change_preserves_future_opt_in_and_rate_limit(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"w" * 32).decode())
    owner = auth(client, "wa-change@example.com")
    path = f"{BASE}/notification-settings/whatsapp"
    first = client.put(
        path, headers=owner, json={"phone": "+525512345678", "consent": True}
    )
    assert first.status_code == 200
    created = client.post(
        f"{BASE}/reminders",
        headers={**owner, "Idempotency-Key": str(uuid4())},
        json=payload(True),
    )
    assert created.status_code == 201
    changed = client.put(
        path, headers=owner, json={"phone": "+525587654321", "consent": True}
    )
    assert changed.status_code == 200
    assert changed.json()["masked_number"].endswith("4321")
    assert changed.json()["consent_text_version"] == "v1"
    reminder = client.get(f"{BASE}/reminders/{created.json()['id']}", headers=owner)
    assert reminder.json()["send_whatsapp"] is True
    for _ in range(3):
        assert (
            client.put(
                path, headers=owner, json={"phone": "+525587654321", "consent": True}
            ).status_code
            == 200
        )
    assert (
        client.put(
            path, headers=owner, json={"phone": "+525587654321", "consent": True}
        ).status_code
        == 429
    )


def test_phone_validation_and_disabled_channel(client: TestClient, monkeypatch) -> None:
    owner = auth(client, "wa-validation@example.com")
    path = f"{BASE}/notification-settings/whatsapp"
    assert client.get(path, headers=owner).json()["available"] is False
    assert (
        client.put(
            path, headers=owner, json={"phone": "+525512345678", "consent": True}
        ).status_code
        == 503
    )
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", "invalid")
    assert client.get(path, headers=owner).json()["available"] is False
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"v" * 32).decode())
    for phone in ("525512345678", "+0123456789", "+12", "+52/5512345678"):
        assert (
            client.put(
                path, headers=owner, json={"phone": phone, "consent": True}
            ).status_code
            == 422
        )
