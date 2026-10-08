"""Contract tests for hiding reminders and their internal notices."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import DeliveryAttempt, Notification, Reminder, get_db
from app.main import app

BASE = "/api/v1"
PASSWORD = "correct horse battery staple"


def auth(client: TestClient, name: str) -> dict[str, str]:
    email = f"{name}-{uuid4()}@example.com"
    response = client.post(
        f"{BASE}/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 201
    login = client.post(
        f"{BASE}/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def create(client: TestClient, headers: dict[str, str], key: str) -> dict:
    future = datetime.now(UTC) + timedelta(days=1)
    response = client.post(
        f"{BASE}/reminders",
        headers={**headers, "Idempotency-Key": key},
        json={
            "message": "Pagar tarjeta",
            "local_date": future.strftime("%Y-%m-%d"),
            "local_time": future.strftime("%H:%M"),
            "timezone": "UTC",
        },
    )
    assert response.status_code == 201
    return response.json()


def delete(client: TestClient, path: str, headers: dict[str, str], version: int):
    return client.request(
        "DELETE", path, headers=headers, json={"expected_version": version}
    )


def test_delete_requires_owner_version_and_keeps_idempotency_key(
    client: TestClient,
) -> None:
    alice = auth(client, "alice-delete")
    bob = auth(client, "bob-delete")
    key = str(uuid4())
    item = create(client, alice, key)
    path = f"{BASE}/reminders/{item['id']}"
    assert delete(client, path, {}, 1).status_code == 401
    assert delete(client, path, bob, 1).status_code == 404
    assert delete(client, path, alice, 2).status_code == 409
    assert client.request("DELETE", path, headers=alice, json={}).status_code == 422
    assert delete(client, path, alice, 1).status_code == 204
    assert delete(client, path, alice, 1).status_code == 404
    assert client.get(path, headers=alice).status_code == 404
    assert (
        client.patch(path, headers=alice, json={"expected_version": 1}).status_code
        == 404
    )
    assert (
        client.post(
            f"{path}/cancel", headers=alice, json={"expected_version": 1}
        ).status_code
        == 404
    )
    assert client.get(f"{BASE}/reminders", headers=alice).json()["items"] == []
    replay = client.post(
        f"{BASE}/reminders",
        headers={**alice, "Idempotency-Key": key},
        json={
            "message": "Pagar tarjeta",
            "local_date": item["local_date"],
            "local_time": item["local_time"],
            "timezone": "UTC",
        },
    )
    assert replay.status_code == 409
    generator = app.dependency_overrides[get_db]()
    db = next(generator)
    row = db.get(Reminder, UUID(item["id"]))
    assert row and row.deleted_at and row.version == 2
    generator.close()


def test_delete_hides_fired_notice_and_cancels_pending_delivery(
    client: TestClient,
) -> None:
    alice = auth(client, "fired-delete")
    item = create(client, alice, str(uuid4()))
    generator = app.dependency_overrides[get_db]()
    db = next(generator)
    row = db.get(Reminder, UUID(item["id"]))
    assert row
    row.status = "fired"
    row.fired_at = datetime.now(UTC)
    db.add(
        Notification(
            user_id=row.user_id,
            reminder_id=row.id,
            title="Recordatorio",
            body=row.message,
            created_at=datetime.now(UTC),
        )
    )
    db.add(
        DeliveryAttempt(
            reminder_id=row.id,
            channel="whatsapp",
            destination_key="test-key",
            status="pending",
            attempt_count=0,
            next_attempt_at=datetime.now(UTC),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    db.commit()
    reminder_id = row.id
    notice_id = db.scalar(
        select(Notification.id).where(Notification.reminder_id == reminder_id)
    )
    generator.close()
    path = f"{BASE}/reminders/{item['id']}"
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 1
    }
    assert delete(client, path, alice, item["version"]).status_code == 204
    assert (
        client.get(f"{BASE}/reminders?status=fired", headers=alice).json()["items"]
        == []
    )
    assert client.get(f"{BASE}/notifications", headers=alice).json()["items"] == []
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 0
    }
    assert (
        client.post(f"{BASE}/notifications/{notice_id}/read", headers=alice).status_code
        == 404
    )
    assert (
        client.post(f"{BASE}/notifications/read-all", headers=alice).status_code == 204
    )
    generator = app.dependency_overrides[get_db]()
    db = next(generator)
    notice = db.scalar(
        select(Notification).where(Notification.reminder_id == reminder_id)
    )
    attempt = db.scalar(
        select(DeliveryAttempt).where(DeliveryAttempt.reminder_id == reminder_id)
    )
    assert notice and notice.read_at is None
    assert attempt and attempt.status == "canceled"
    generator.close()


def test_delete_canceled_but_rejects_processing(client: TestClient) -> None:
    alice = auth(client, "states-delete")
    canceled = create(client, alice, str(uuid4()))
    canceled_path = f"{BASE}/reminders/{canceled['id']}"
    response = client.post(
        f"{canceled_path}/cancel",
        headers=alice,
        json={"expected_version": 1},
    )
    assert response.status_code == 200
    assert delete(client, canceled_path, alice, 2).status_code == 204
    assert (
        client.get(f"{BASE}/reminders?status=canceled", headers=alice).json()["items"]
        == []
    )
    processing = create(client, alice, str(uuid4()))
    generator = app.dependency_overrides[get_db]()
    db = next(generator)
    row = db.get(Reminder, UUID(processing["id"]))
    assert row
    row.status = "processing"
    db.commit()
    generator.close()
    assert (
        delete(client, f"{BASE}/reminders/{processing['id']}", alice, 1).status_code
        == 409
    )


def test_deleted_rows_do_not_consume_cursor_pages(client: TestClient) -> None:
    alice = auth(client, "cursor-delete")
    items = [create(client, alice, str(uuid4())) for _ in range(3)]
    ordered = client.get(f"{BASE}/reminders", headers=alice).json()["items"]
    first = ordered[0]
    assert (
        delete(client, f"{BASE}/reminders/{first['id']}", alice, 1).status_code == 204
    )
    page = client.get(f"{BASE}/reminders?limit=1", headers=alice).json()
    assert page["items"][0]["id"] == ordered[1]["id"]
    assert page["next_cursor"]
    next_page = client.get(
        f"{BASE}/reminders?limit=1&cursor={page['next_cursor']}", headers=alice
    ).json()
    assert next_page["items"][0]["id"] == ordered[2]["id"]
    assert next_page["next_cursor"] is None
    assert {item["id"] for item in items} == {item["id"] for item in ordered}
