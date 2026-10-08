"""Contract tests for the reminder and inbox vertical slice."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.db import Notification, get_db
from app.main import app

BASE = "/api/v1"
PASSWORD = "correct horse battery staple"


def bearer(client: TestClient, email: str) -> dict[str, str]:
    assert (
        client.post(
            f"{BASE}/auth/register", json={"email": email, "password": PASSWORD}
        ).status_code
        == 201
    )
    login = client.post(
        f"{BASE}/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def reminder_payload(minutes: int = 10) -> dict[str, str]:
    future = datetime.now(UTC) + timedelta(minutes=minutes)
    return {
        "message": "Pagar la tarjeta",
        "local_date": future.strftime("%Y-%m-%d"),
        "local_time": future.strftime("%H:%M"),
        "timezone": "UTC",
    }


def create(client: TestClient, auth: dict[str, str], key: str | None = None):
    return client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": key or str(uuid4())},
        json=reminder_payload(),
    )


def test_create_preview_idempotency_and_validation(client: TestClient) -> None:
    auth = bearer(client, "reminders@example.com")
    payload = reminder_payload()
    preview = client.post(
        f"{BASE}/reminders/preview",
        headers=auth,
        json={name: payload[name] for name in ("local_date", "local_time", "timezone")},
    )
    assert preview.status_code == 200
    assert preview.json()["resolution"] == "exact"
    key = str(uuid4())
    first = client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": key},
        json=payload,
    )
    assert first.status_code == 201
    assert first.json()["status"] == "scheduled"
    assert first.json()["send_whatsapp"] is False
    assert first.json()["scheduled_at_utc"] == preview.json()["scheduled_at_utc"]
    replay = client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": key},
        json=payload,
    )
    assert replay.status_code == 200
    assert replay.json()["id"] == first.json()["id"]
    changed = client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": key},
        json={**payload, "message": "Otro mensaje"},
    )
    assert changed.status_code == 409
    assert create(client, auth, key="bad-key").status_code == 422
    assert (
        client.post(f"{BASE}/reminders", headers=auth, json=payload).status_code == 422
    )
    for invalid in (
        {**payload, "message": "   "},
        {**payload, "message": "x" * 281},
        {**payload, "timezone": "Not/A_Zone"},
        {**payload, "local_date": "2000-01-01"},
        {**payload, "send_whatsapp": True},
    ):
        assert (
            client.post(
                f"{BASE}/reminders",
                headers={**auth, "Idempotency-Key": str(uuid4())},
                json=invalid,
            ).status_code
            == 422
        )


def test_reminder_and_inbox_require_authentication(client: TestClient) -> None:
    assert client.get(f"{BASE}/reminders").status_code == 401
    assert client.get(f"{BASE}/notifications").status_code == 401
    assert (
        client.post(f"{BASE}/reminders/preview", json=reminder_payload()).status_code
        == 401
    )


def test_owner_version_edit_cancel_and_lists(client: TestClient) -> None:
    alice = bearer(client, "alice-reminders@example.com")
    bob = bearer(client, "bob-reminders@example.com")
    created = create(client, alice)
    assert created.status_code == 201
    item = created.json()
    path = f"{BASE}/reminders/{item['id']}"
    assert client.get(path, headers=bob).status_code == 404
    assert (
        client.patch(path, headers=bob, json={"expected_version": 1}).status_code == 404
    )
    assert (
        client.post(
            f"{path}/cancel", headers=bob, json={"expected_version": 1}
        ).status_code
        == 404
    )
    assert client.get(f"{BASE}/reminders?limit=101", headers=alice).status_code == 422
    page = client.get(f"{BASE}/reminders?limit=1", headers=alice)
    assert page.status_code == 200
    assert [entry["id"] for entry in page.json()["items"]] == [item["id"]]
    assert client.get(f"{BASE}/reminders", headers=bob).json()["items"] == []
    edited = client.patch(
        path,
        headers=alice,
        json={"expected_version": 1, "message": "Pagar mañana"},
    )
    assert edited.status_code == 200
    assert edited.json()["version"] == 2
    assert edited.json()["message"] == "Pagar mañana"
    assert (
        client.patch(path, headers=alice, json={"expected_version": 1}).status_code
        == 409
    )
    canceled = client.post(
        f"{path}/cancel", headers=alice, json={"expected_version": 2}
    )
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "canceled"
    assert (
        client.post(
            f"{path}/cancel", headers=alice, json={"expected_version": 2}
        ).status_code
        == 409
    )
    assert (
        client.get(f"{BASE}/reminders?status=canceled", headers=alice).json()["items"][
            0
        ]["id"]
        == item["id"]
    )


def test_inbox_is_user_scoped_and_read_operations_are_idempotent(
    client: TestClient,
) -> None:
    alice = bearer(client, "alice-inbox@example.com")
    bob = bearer(client, "bob-inbox@example.com")
    assert client.get(f"{BASE}/notifications", headers=alice).json()["items"] == []
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 0
    }
    assert (
        client.get(f"{BASE}/notifications?limit=101", headers=alice).status_code == 422
    )
    assert (
        client.post(f"{BASE}/notifications/read-all", headers=alice).status_code == 204
    )
    assert (
        client.post(f"{BASE}/notifications/{uuid4()}/read", headers=bob).status_code
        == 404
    )
    reminder = create(client, alice).json()
    user_id = UUID(client.get(f"{BASE}/auth/me", headers=alice).json()["id"])
    session_generator = app.dependency_overrides[get_db]()
    db = next(session_generator)
    notice = Notification(
        user_id=user_id,
        reminder_id=UUID(reminder["id"]),
        title="Recordatorio vencido",
        body=reminder["message"],
        created_at=datetime.now(UTC),
    )
    db.add(notice)
    db.commit()
    notice_id = notice.id
    session_generator.close()
    assert client.get(f"{BASE}/notifications", headers=bob).json()["items"] == []
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 1
    }
    assert client.post(f"{BASE}/notifications/read-all", headers=bob).status_code == 204
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 1
    }
    assert (
        client.post(f"{BASE}/notifications/{notice_id}/read", headers=bob).status_code
        == 404
    )
    assert (
        client.post(f"{BASE}/notifications/{notice_id}/read", headers=alice).status_code
        == 204
    )
    assert (
        client.post(f"{BASE}/notifications/{notice_id}/read", headers=alice).status_code
        == 204
    )
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 0
    }
    second_reminder = create(client, alice).json()
    session_generator = app.dependency_overrides[get_db]()
    db = next(session_generator)
    second_notice = Notification(
        user_id=user_id,
        reminder_id=UUID(second_reminder["id"]),
        title="Otro recordatorio vencido",
        body=second_reminder["message"],
        created_at=datetime.now(UTC) + timedelta(seconds=1),
    )
    db.add(second_notice)
    db.commit()
    second_id = second_notice.id
    session_generator.close()
    first_page = client.get(f"{BASE}/notifications?limit=1", headers=alice).json()
    assert [item["id"] for item in first_page["items"]] == [str(second_id)]
    assert first_page["next_cursor"]
    second_page = client.get(
        f"{BASE}/notifications?limit=1&cursor={first_page['next_cursor']}",
        headers=alice,
    ).json()
    assert [item["id"] for item in second_page["items"]] == [str(notice_id)]
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 1
    }
    assert (
        client.post(f"{BASE}/notifications/read-all", headers=alice).status_code == 204
    )
    assert client.get(f"{BASE}/notifications/unread-count", headers=alice).json() == {
        "count": 0
    }


def test_cursor_and_timezone_edit_preserves_wall_time(client: TestClient) -> None:
    auth = bearer(client, "cursor-reminders@example.com")
    early = client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": str(uuid4())},
        json=reminder_payload(2 * 24 * 60),
    ).json()
    later = client.post(
        f"{BASE}/reminders",
        headers={**auth, "Idempotency-Key": str(uuid4())},
        json=reminder_payload(3 * 24 * 60),
    ).json()
    first_page = client.get(f"{BASE}/reminders?limit=1", headers=auth).json()
    assert [item["id"] for item in first_page["items"]] == [early["id"]]
    cursor = first_page["next_cursor"]
    assert cursor
    second_page = client.get(
        f"{BASE}/reminders?limit=1&cursor={cursor}", headers=auth
    ).json()
    assert [item["id"] for item in second_page["items"]] == [later["id"]]
    assert second_page["next_cursor"] is None
    assert (
        client.get(
            f"{BASE}/reminders?status=fired&cursor={cursor}", headers=auth
        ).status_code
        == 422
    )
    edited = client.patch(
        f"{BASE}/reminders/{later['id']}",
        headers=auth,
        json={"expected_version": 1, "timezone": "America/New_York"},
    )
    assert edited.status_code == 200
    assert edited.json()["local_date"] == later["local_date"]
    assert edited.json()["local_time"] == later["local_time"]
    assert edited.json()["scheduled_at_utc"] != later["scheduled_at_utc"]
