"""Small validated cursors for owner-scoped timelines."""

from __future__ import annotations

import base64
import json
from datetime import datetime
from uuid import UUID

from app.auth_service import AuthProblem


def encode_cursor(kind: str, at: datetime, item_id: UUID) -> str:
    value = json.dumps(
        {"kind": kind, "at": at.isoformat(), "id": str(item_id)}, separators=(",", ":")
    )
    return base64.urlsafe_b64encode(value.encode()).rstrip(b"=").decode()


def decode_cursor(value: str, kind: str) -> tuple[datetime, UUID]:
    try:
        if len(value) > 256:
            raise ValueError("cursor too long")
        data = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if data["kind"] != kind:
            raise ValueError("wrong cursor kind")
        at = datetime.fromisoformat(data["at"])
        if at.tzinfo is None:
            raise ValueError("naive cursor")
        return at, UUID(data["id"])
    except (ValueError, KeyError, TypeError, UnicodeDecodeError) as exc:
        raise AuthProblem(422, "Invalid cursor") from exc
