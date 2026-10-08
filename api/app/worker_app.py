"""Separate worker process with liveness and readiness endpoints."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager, nullcontext
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, Response

from app.db import session_factory
from app.reminder_worker import run_once
from app.whatsapp_crypto import enabled, keys
from app.whatsapp_dispatch import dispatch_once

logger = logging.getLogger(__name__)
_last_success = 0.0
_poll_seconds = 10.0
_whatsapp_url: str | None = None
_whatsapp_token: str | None = None


def _dispatch_config() -> tuple[str, str] | None:
    if not enabled():
        return None
    keys()
    url = os.environ.get("WHATSAPP_API_URL", "").rstrip("/")
    token = os.environ.get("WHATSAPP_SERVICE_TOKEN", "")
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.netloc or parts.path or len(token) < 32:
        raise RuntimeError("Complete HTTPS WhatsApp dispatch configuration required")
    return url, token


async def _loop() -> None:
    global _last_success
    url = os.environ["DATABASE_URL"]
    factory = session_factory(url)
    with (
        httpx.Client(base_url=_whatsapp_url)
        if _whatsapp_url
        else nullcontext(None) as client
    ):
        while True:
            try:
                await asyncio.to_thread(run_once, factory)
                if client is not None and _whatsapp_token:
                    await asyncio.to_thread(
                        dispatch_once, factory, client, _whatsapp_token
                    )
                _last_success = time.monotonic()
            except Exception as exc:  # noqa: BLE001
                # SQL and HTTP errors can contain sensitive request data.
                logger.error("Worker cycle failed: %s", type(exc).__name__)
            await asyncio.sleep(_poll_seconds)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    global _poll_seconds, _whatsapp_url, _whatsapp_token
    _poll_seconds = float(os.environ.get("WORKER_POLL_SECONDS", "10"))
    if not 0.1 <= _poll_seconds <= 60:
        raise RuntimeError("WORKER_POLL_SECONDS must be between 0.1 and 60")
    config = _dispatch_config()
    _whatsapp_url, _whatsapp_token = config if config else (None, None)
    task = asyncio.create_task(_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Recordatorios Worker", lifespan=lifespan)


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/readyz")
def ready(response: Response) -> dict[str, str]:
    if not _last_success or time.monotonic() - _last_success > max(
        60, _poll_seconds * 3
    ):
        response.status_code = 503
        return {"status": "unready"}
    return {"status": "ready"}
