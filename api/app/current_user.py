"""Shared access-token validation for protected API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.auth_service import AuthProblem, authenticate_access
from app.db import User, get_db
from app.settings import Settings, get_settings


def current_user(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthProblem(401, "Invalid session")
    return authenticate_access(db, settings, authorization.removeprefix("Bearer "))
