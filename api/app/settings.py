"""Runtime configuration; secrets are never read from committed files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_private_key: str
    jwt_public_key: str
    jwt_kid: str
    jwt_issuer: str
    jwt_audience: str
    refresh_secret: str
    access_seconds: int = 900


@lru_cache
def get_settings() -> Settings:
    required = (
        "DATABASE_URL",
        "JWT_PRIVATE_KEY",
        "JWT_PUBLIC_KEY",
        "JWT_KID",
        "JWT_ISSUER",
        "JWT_AUDIENCE",
        "REFRESH_SECRET",
    )
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise RuntimeError(f"Missing required configuration: {', '.join(missing)}")
    access_seconds = int(os.environ.get("JWT_ACCESS_SECONDS", "900"))
    if not 30 <= access_seconds <= 900:
        raise RuntimeError("JWT_ACCESS_SECONDS must be between 30 and 900")
    if len(os.environ["REFRESH_SECRET"]) < 32:
        raise RuntimeError("REFRESH_SECRET must be at least 32 characters")
    return Settings(
        database_url=os.environ["DATABASE_URL"],
        jwt_private_key=os.environ["JWT_PRIVATE_KEY"].replace("\\n", "\n"),
        jwt_public_key=os.environ["JWT_PUBLIC_KEY"].replace("\\n", "\n"),
        jwt_kid=os.environ["JWT_KID"],
        jwt_issuer=os.environ["JWT_ISSUER"],
        jwt_audience=os.environ["JWT_AUDIENCE"],
        refresh_secret=os.environ["REFRESH_SECRET"],
        access_seconds=access_seconds,
    )
