from datetime import timedelta

import jwt
from fastapi.testclient import TestClient

from app import auth_service
from app.main import app
from app.settings import get_settings

BASE = "/api/v1/auth"
PASSWORD = "correct horse battery staple"


def register(client: TestClient, email: str = "Demo@Example.com") -> dict:
    response = client.post(
        f"{BASE}/register", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 201
    return response.json()


def test_register_login_unverified_and_protected_profile(client: TestClient) -> None:
    user = register(client)
    assert user["email"] == "Demo@example.com"
    assert user["email_verified"] is False
    assert "password" not in user
    assert (
        client.post(
            f"{BASE}/register",
            json={"email": " demo@example.COM ", "password": PASSWORD},
        ).status_code
        == 409
    )

    login = client.post(
        f"{BASE}/login", json={"email": " demo@EXAMPLE.com ", "password": PASSWORD}
    )
    assert login.status_code == 200
    tokens = login.json()
    assert tokens["token_type"] == "Bearer"
    assert tokens["expires_in"] == 900
    assert tokens["user"]["id"] == user["id"]
    assert tokens["user"]["email_verified"] is False
    assert tokens["access_token"] and tokens["refresh_token"]

    assert client.get(f"{BASE}/me").status_code == 401
    profile = client.get(
        f"{BASE}/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert profile.status_code == 200
    assert profile.json()["id"] == user["id"]


def test_invalid_input_and_generic_bad_credentials(client: TestClient) -> None:
    assert (
        client.post(
            f"{BASE}/register", json={"email": "invalid", "password": PASSWORD}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"{BASE}/register", json={"email": "a@example.com", "password": "short"}
        ).status_code
        == 422
    )
    register(client)
    unknown = client.post(
        f"{BASE}/login", json={"email": "missing@example.com", "password": PASSWORD}
    )
    wrong = client.post(
        f"{BASE}/login",
        json={"email": "demo@example.com", "password": "totally wrong password"},
    )
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["title"] == wrong.json()["title"]
    assert unknown.json()["detail"] == wrong.json()["detail"]
    assert unknown.json()["traceId"] == unknown.headers["X-Request-ID"]


def test_refresh_is_rotated_and_logout_revokes_access(client: TestClient) -> None:
    register(client)
    login = client.post(
        f"{BASE}/login", json={"email": "demo@example.com", "password": PASSWORD}
    ).json()
    first = client.post(
        f"{BASE}/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert first.status_code == 200
    renewed = first.json()
    assert renewed["refresh_token"] != login["refresh_token"]
    parallel = client.post(
        f"{BASE}/refresh", json={"refresh_token": login["refresh_token"]}
    )
    assert parallel.status_code == 200
    assert parallel.json()["refresh_token"] == renewed["refresh_token"]

    logout = client.post(
        f"{BASE}/logout", json={"refresh_token": renewed["refresh_token"]}
    )
    assert logout.status_code == 204
    assert (
        client.get(
            f"{BASE}/me", headers={"Authorization": f"Bearer {renewed['access_token']}"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": renewed["refresh_token"]}
        ).status_code
        == 401
    )


def test_login_rate_limit(client: TestClient) -> None:
    register(client)
    for _ in range(5):
        assert (
            client.post(
                f"{BASE}/login",
                json={"email": "demo@example.com", "password": "wrong password 123"},
            ).status_code
            == 401
        )
    assert (
        client.post(
            f"{BASE}/login",
            json={"email": "demo@example.com", "password": "wrong password 123"},
        ).status_code
        == 429
    )


def test_login_ip_rate_limit_across_emails(client: TestClient) -> None:
    for index in range(20):
        response = client.post(
            f"{BASE}/login",
            json={"email": f"missing-{index}@example.com", "password": PASSWORD},
        )
        assert response.status_code == 401
    blocked = client.post(
        f"{BASE}/login",
        json={"email": "another@example.com", "password": PASSWORD},
    )
    assert blocked.status_code == 429


def test_registration_rate_limit(client: TestClient) -> None:
    for index in range(5):
        register(client, f"new-{index}@example.com")
    response = client.post(
        f"{BASE}/register",
        json={"email": "sixth@example.com", "password": PASSWORD},
    )
    assert response.status_code == 429


def test_old_refresh_token_stops_after_grace(client: TestClient, monkeypatch) -> None:
    register(client)
    login = client.post(
        f"{BASE}/login", json={"email": "demo@example.com", "password": PASSWORD}
    ).json()
    renewed = client.post(
        f"{BASE}/refresh", json={"refresh_token": login["refresh_token"]}
    ).json()
    original_now = auth_service.now_utc
    monkeypatch.setattr(
        auth_service, "now_utc", lambda: original_now() + timedelta(seconds=31)
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": login["refresh_token"]}
        ).status_code
        == 401
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": renewed["refresh_token"]}
        ).status_code
        == 200
    )


def test_jwt_claims_and_expired_refresh(client: TestClient, monkeypatch) -> None:
    register(client)
    login = client.post(
        f"{BASE}/login", json={"email": "demo@example.com", "password": PASSWORD}
    ).json()
    settings = app.dependency_overrides[get_settings]()
    assert jwt.get_unverified_header(login["access_token"])["kid"] == "test-key"
    claims = jwt.decode(
        login["access_token"],
        settings.jwt_public_key,
        algorithms=["RS256"],
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
    )
    assert claims["auth_version"] == 0
    assert claims["sid"] and claims["jti"]
    assert (
        client.get(
            f"{BASE}/me",
            headers={"Authorization": "Bearer " + login["access_token"] + "x"},
        ).status_code
        == 401
    )

    original_now = auth_service.now_utc
    monkeypatch.setattr(
        auth_service, "now_utc", lambda: original_now() + timedelta(days=8)
    )
    assert (
        client.post(
            f"{BASE}/refresh", json={"refresh_token": login["refresh_token"]}
        ).status_code
        == 401
    )
