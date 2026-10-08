"""HTTP endpoints for verification and password recovery."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.account_email import consume_link, issue_link, send_email
from app.auth_service import (
    AuthProblem,
    authenticate_access,
    normalize_email,
    rate_hit,
    rate_key,
)
from app.db import User, get_db
from app.schemas import AccountTokenRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1/auth")
Db = Annotated[Session, Depends(get_db)]
Config = Annotated[Settings, Depends(get_settings)]


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/verify-email", status_code=204)
def verify_email(
    body: AccountTokenRequest, request: Request, db: Db, settings: Config
) -> Response:
    from datetime import timedelta

    if (
        rate_hit(
            db, rate_key(settings, "verify-ip", _ip(request)), timedelta(minutes=15)
        )
        > 20
    ):
        raise AuthProblem(429, "Too many requests")
    consume_link(db, body.token, "verify_email")
    return Response(status_code=204)


@router.post("/resend-verification", status_code=202)
def resend_verification(
    request: Request,
    tasks: BackgroundTasks,
    db: Db,
    settings: Config,
    authorization: Annotated[str | None, Header()] = None,
) -> Response:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthProblem(401, "Invalid session")
    user = authenticate_access(db, settings, authorization.removeprefix("Bearer "))
    message = issue_link(db, settings, user, "verify_email", _ip(request))
    if message:
        tasks.add_task(send_email, settings, message)
    return Response(status_code=202)


@router.post("/forgot-password", status_code=202)
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    tasks: BackgroundTasks,
    db: Db,
    settings: Config,
) -> Response:
    normalized = normalize_email(str(body.email))
    user = db.scalar(select(User).where(User.email_normalized == normalized))
    message = issue_link(db, settings, user, "reset_password", _ip(request), normalized)
    if message:
        tasks.add_task(send_email, settings, message)
    return Response(status_code=202)


@router.post("/reset-password", status_code=204)
def reset_password(
    body: ResetPasswordRequest, request: Request, db: Db, settings: Config
) -> Response:
    from datetime import timedelta

    if (
        rate_hit(
            db, rate_key(settings, "reset-ip", _ip(request)), timedelta(minutes=15)
        )
        > 20
    ):
        raise AuthProblem(429, "Too many requests")
    consume_link(db, body.token, "reset_password", body.new_password)
    return Response(status_code=204)
