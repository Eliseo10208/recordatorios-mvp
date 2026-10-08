"""Worker never starts external dispatch with incomplete configuration."""

import base64
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest

from app.whatsapp_dispatch import _retry_after
from app.worker_app import _dispatch_config


def test_dispatch_is_disabled_without_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WHATSAPP_ENABLED", "false")
    assert _dispatch_config() is None


def test_dispatch_requires_complete_https_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WHATSAPP_ENABLED", "true")
    monkeypatch.setenv("WHATSAPP_PHONE_KEY", base64.b64encode(b"k" * 32).decode())
    monkeypatch.delenv("WHATSAPP_SERVICE_TOKEN", raising=False)
    monkeypatch.setenv(
        "WHATSAPP_API_URL", "https://recordatorios-whatsapp-kxia.onrender.com"
    )
    with pytest.raises(RuntimeError, match="Complete HTTPS"):
        _dispatch_config()
    monkeypatch.setenv(
        "WHATSAPP_SERVICE_TOKEN", "test-token-with-at-least-32-characters"
    )
    monkeypatch.setenv("WHATSAPP_API_URL", "http://example.test")
    with pytest.raises(RuntimeError, match="Complete HTTPS"):
        _dispatch_config()
    monkeypatch.setenv(
        "WHATSAPP_API_URL", "https://recordatorios-whatsapp-kxia.onrender.com"
    )
    assert _dispatch_config() == (
        "https://recordatorios-whatsapp-kxia.onrender.com",
        "test-token-with-at-least-32-characters",
    )


def test_retry_after_accepts_http_date() -> None:
    date = format_datetime(datetime.now(UTC) + timedelta(minutes=2), usegmt=True)
    response = httpx.Response(429, headers={"Retry-After": date})
    delay = _retry_after(response)
    assert delay is not None and 110 <= delay <= 120
