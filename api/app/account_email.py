"""Single-use account links and the isolated Resend transport."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth_service import (
    AuthProblem,
    normalize_email,
    now_utc,
    rate_hit,
    rate_key,
)
from app.db import AccountToken, RefreshSession, User
from app.settings import Settings

_PASSWORD_HASH = PasswordHash.recommended()
_GENERIC_TITLE = "Invalid or expired link"


@dataclass(frozen=True)
class EmailMessage:
    recipient: str
    subject: str
    text: str
    idempotency_key: str


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _allow_send(
    db: Session, settings: Settings, email: str, ip: str, exists: bool
) -> bool:
    # The same limits apply whether the account exists or not.
    normalized = normalize_email(email)
    hour = timedelta(hours=1)
    if rate_hit(db, rate_key(settings, "account-email-address", normalized), hour) > 3:
        return False
    if rate_hit(db, rate_key(settings, "account-email-ip", ip), hour) > 20:
        return False
    if not exists:
        return True
    day = timedelta(days=1)
    return rate_hit(db, rate_key(settings, "account-email-daily", "global"), day) <= 80


def issue_link(
    db: Session,
    settings: Settings,
    user: User | None,
    purpose: str,
    ip: str,
    email: str | None = None,
) -> EmailMessage | None:
    if not settings.account_email_enabled:
        return None
    if (
        purpose == "verify_email"
        and user is not None
        and user.email_verified_at is not None
    ):
        return None
    allowed = _allow_send(
        db, settings, email or (user.email if user else ""), ip, user is not None
    )
    if user is None or not allowed:
        return None
    token = secrets.token_urlsafe(32)
    row = AccountToken(
        id=uuid4(),
        user_id=user.id,
        purpose=purpose,
        token_hash=_digest(token),
        created_at=now_utc(),
        expires_at=now_utc()
        + timedelta(
            hours=24 if purpose == "verify_email" else 0,
            minutes=30 if purpose == "reset_password" else 0,
        ),
        consumed_at=None,
    )
    db.add(row)
    db.commit()
    path = "/verify-email" if purpose == "verify_email" else "/reset-password"
    link = f"{settings.web_base_url}{path}#{urlencode({'token': token})}"
    subject = (
        "Verifica tu correo"
        if purpose == "verify_email"
        else "Restablece tu contraseña"
    )
    return EmailMessage(
        recipient=user.email,
        subject=subject,
        text=f"Abre este enlace para continuar: {link}\n\nSi no solicitaste este correo, ignóralo.",
        idempotency_key=str(row.id),
    )


def send_email(settings: Settings, message: EmailMessage) -> None:
    payload = {
        "from": settings.resend_from_email,
        "to": [message.recipient],
        "subject": message.subject,
        "text": message.text,
    }
    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Idempotency-Key": message.idempotency_key,
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(5.0)) as client:
            for attempt in range(2):
                response = client.post(
                    "https://api.resend.com/emails", json=payload, headers=headers
                )
                if response.status_code not in (429, 500, 502, 503, 504) or attempt:
                    response.raise_for_status()
                    return
    except httpx.HTTPError:
        # The link remains valid. A user can request a fresh link later.
        # Never log the payload, recipient, provider response, or token.
        return


def consume_link(
    db: Session, token: str, purpose: str, new_password: str | None = None
) -> None:
    try:
        digest = _digest(token)
    except (UnicodeEncodeError, ValueError) as exc:
        raise AuthProblem(400, _GENERIC_TITLE) from exc
    row = db.scalar(
        select(AccountToken)
        .where(AccountToken.token_hash == digest, AccountToken.purpose == purpose)
        .with_for_update()
    )
    moment = now_utc()
    if (
        row is None
        or row.consumed_at is not None
        or row.expires_at.replace(tzinfo=row.expires_at.tzinfo or UTC) <= moment
    ):
        db.rollback()
        raise AuthProblem(400, _GENERIC_TITLE)
    user = db.scalar(select(User).where(User.id == row.user_id).with_for_update())
    if user is None:
        db.rollback()
        raise AuthProblem(400, _GENERIC_TITLE)
    row.consumed_at = moment
    if purpose == "verify_email":
        user.email_verified_at = moment
        db.execute(
            update(AccountToken)
            .where(
                AccountToken.user_id == user.id,
                AccountToken.purpose == purpose,
                AccountToken.consumed_at.is_(None),
            )
            .values(consumed_at=moment)
        )
    else:
        if new_password is None:
            raise ValueError("new_password is required for reset")
        user.password_hash = _PASSWORD_HASH.hash(new_password)
        user.email_verified_at = moment
        user.auth_version += 1
        db.execute(
            update(AccountToken)
            .where(AccountToken.user_id == user.id, AccountToken.consumed_at.is_(None))
            .values(consumed_at=moment)
        )
        db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
            )
            .values(revoked_at=moment)
        )
    db.commit()
