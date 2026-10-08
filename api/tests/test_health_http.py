"""Liveness and database readiness contracts."""

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.db import get_db
from app.main import app


def test_health_is_public_and_contains_no_private_data(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_ready_reports_database_availability(client: TestClient) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}

    class BrokenSession:
        def execute(self, _statement: object) -> None:
            raise SQLAlchemyError("database unavailable")

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json() == {"status": "unready"}
    assert "database unavailable" not in response.text
