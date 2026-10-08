"""Account rules, token rotation, and authentication rate limits."""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt
from pwdlib import PasswordHash
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import AuthRateLimit, RefreshAlias, RefreshSession, User
from app.schemas import TokenPair, UserPublic
from app.settings import Settings

_PASSWORD_HASH = PasswordHash.recommended()
_DUMMY_HASH = _PASSWORD_HASH.hash("dummy password for equal work")
SESSION_DAYS = 7
ALIAS_SECONDS = 30


class AuthProblem(Exception):
    def __init__(self, status: int, title: str) -> None:
        self.status = status
        self.title = title


def now_utc() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def public_user(user: User) -> UserPublic:
    return UserPublic(
        id=user.id, email=user.email, email_verified=user.email_verified_at is not None
    )


def rate_key(settings: Settings, scope: str, value: str) -> str:
    return hmac.new(
        settings.refresh_secret.encode(), f"{scope}:{value}".encode(), hashlib.sha256
    ).hexdigest()


def _rate_count(db: Session, key: str, window: timedelta) -> int:
    row = db.get(AuthRateLimit, key)
    if row is None or _aware(row.window_start) <= now_utc() - window:
        return 0
    return row.attempts


def rate_hit(db: Session, key: str, window: timedelta) -> int:
    moment = now_utc()
    cutoff = moment - window
    count = db.scalar(
        text(
            "INSERT INTO auth_rate_limits (key, window_start, attempts) "
            "VALUES (:key, :moment, 1) ON CONFLICT (key) DO UPDATE SET "
            "attempts = CASE WHEN auth_rate_limits.window_start <= :cutoff "
            "THEN 1 ELSE auth_rate_limits.attempts + 1 END, "
            "window_start = CASE WHEN auth_rate_limits.window_start <= :cutoff "
            "THEN :moment ELSE auth_rate_limits.window_start END "
            "RETURNING attempts"
        ),
        {"key": key, "moment": moment, "cutoff": cutoff},
    )
    db.commit()
    return int(count)


def register(
    db: Session, settings: Settings, email: str, password: str, ip: str
) -> User:
    key = rate_key(settings, "register-ip", ip)
    if rate_hit(db, key, timedelta(hours=1)) > 5:
        raise AuthProblem(429, "Too many requests")
    user = User(
        email=email,
        email_normalized=normalize_email(email),
        password_hash=_PASSWORD_HASH.hash(password),
        email_verified_at=None,
        auth_version=0,
        created_at=now_utc(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AuthProblem(409, "Email already registered") from exc
    db.refresh(user)
    return user


def _refresh_token(settings: Settings, session_id: UUID, generation: int) -> str:
    prefix = f"{session_id}.{generation}"
    signature = hmac.new(
        settings.refresh_secret.encode(), prefix.encode(), hashlib.sha256
    ).digest()
    return f"{prefix}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _parse_refresh(settings: Settings, value: str) -> tuple[UUID, int, str]:
    try:
        raw_id, raw_generation, _signature = value.split(".")
        session_id = UUID(raw_id)
        generation = int(raw_generation)
        if generation < 0 or not hmac.compare_digest(
            _refresh_token(settings, session_id, generation), value
        ):
            raise ValueError("bad signature")
    except (ValueError, AttributeError) as exc:
        raise AuthProblem(401, "Invalid session") from exc
    return session_id, generation, _token_hash(value)


def _access_token(settings: Settings, user: User, session_id: UUID) -> str:
    moment = now_utc()
    return jwt.encode(
        {
            "sub": str(user.id),
            "sid": str(session_id),
            "auth_version": user.auth_version,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": moment,
            "exp": moment + timedelta(seconds=settings.access_seconds),
            "jti": str(uuid4()),
        },
        settings.jwt_private_key,
        algorithm="RS256",
        headers={"kid": settings.jwt_kid},
    )


def _pair(settings: Settings, user: User, session: RefreshSession) -> TokenPair:
    return TokenPair(
        user=public_user(user),
        access_token=_access_token(settings, user, session.id),
        refresh_token=_refresh_token(settings, session.id, session.generation),
        expires_in=settings.access_seconds,
    )


def login(
    db: Session, settings: Settings, email: str, password: str, ip: str
) -> TokenPair:
    normalized = normalize_email(email)
    pair_key = rate_key(settings, "login-pair", f"{ip}:{normalized}")
    ip_key = rate_key(settings, "login-ip", ip)
    window = timedelta(minutes=15)
    if _rate_count(db, pair_key, window) >= 5 or _rate_count(db, ip_key, window) >= 20:
        raise AuthProblem(429, "Too many requests")
    user = db.scalar(select(User).where(User.email_normalized == normalized))
    valid = _PASSWORD_HASH.verify(password, user.password_hash if user else _DUMMY_HASH)
    if not valid or user is None:
        pair_count = rate_hit(db, pair_key, window)
        ip_count = rate_hit(db, ip_key, window)
        if pair_count > 5 or ip_count > 20:
            raise AuthProblem(429, "Too many requests")
        raise AuthProblem(401, "Invalid credentials")
    db.execute(delete(AuthRateLimit).where(AuthRateLimit.key == pair_key))
    session_id = uuid4()
    refresh = _refresh_token(settings, session_id, 0)
    session = RefreshSession(
        id=session_id,
        user_id=user.id,
        token_hash=_token_hash(refresh),
        generation=0,
        created_at=now_utc(),
        expires_at=now_utc() + timedelta(days=SESSION_DAYS),
        revoked_at=None,
    )
    db.add(session)
    db.commit()
    return _pair(settings, user, session)


def refresh(db: Session, settings: Settings, token: str, ip: str) -> TokenPair:
    key = rate_key(settings, "refresh-ip", ip)
    if rate_hit(db, key, timedelta(minutes=1)) > 60:
        raise AuthProblem(429, "Too many requests")
    session_id, generation, digest = _parse_refresh(settings, token)
    session = db.scalar(
        select(RefreshSession).where(RefreshSession.id == session_id).with_for_update()
    )
    if (
        session is None
        or session.revoked_at is not None
        or _aware(session.expires_at) <= now_utc()
    ):
        raise AuthProblem(401, "Invalid session")
    if digest == session.token_hash and generation == session.generation:
        db.execute(
            delete(RefreshAlias).where(
                RefreshAlias.session_id == session.id,
                RefreshAlias.expires_at < now_utc(),
            )
        )
        db.add(
            RefreshAlias(
                token_hash=digest,
                session_id=session.id,
                expires_at=now_utc() + timedelta(seconds=ALIAS_SECONDS),
            )
        )
        session.generation += 1
        session.token_hash = _token_hash(
            _refresh_token(settings, session.id, session.generation)
        )
        db.commit()
    else:
        alias = db.get(RefreshAlias, digest)
        if (
            alias is None
            or alias.session_id != session.id
            or _aware(alias.expires_at) <= now_utc()
        ):
            raise AuthProblem(401, "Invalid session")
    user = db.get(User, session.user_id)
    if user is None:
        raise AuthProblem(401, "Invalid session")
    return _pair(settings, user, session)


def logout(db: Session, settings: Settings, token: str) -> None:
    try:
        session_id, _generation, digest = _parse_refresh(settings, token)
    except AuthProblem:
        return
    session = db.get(RefreshSession, session_id)
    alias = db.get(RefreshAlias, digest)
    if session and (
        digest == session.token_hash
        or (
            alias is not None
            and alias.session_id == session.id
            and _aware(alias.expires_at) > now_utc()
        )
    ):
        session.revoked_at = now_utc()
        db.commit()


def authenticate_access(db: Session, settings: Settings, token: str) -> User:
    try:
        header = jwt.get_unverified_header(token)
        if header.get("kid") != settings.jwt_kid or header.get("alg") != "RS256":
            raise jwt.InvalidTokenError("unsupported key")
        claims = jwt.decode(
            token,
            settings.jwt_public_key,
            algorithms=["RS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={
                "require": [
                    "sub",
                    "sid",
                    "auth_version",
                    "iss",
                    "aud",
                    "iat",
                    "exp",
                    "jti",
                ]
            },
        )
        user = db.get(User, UUID(claims["sub"]))
        session = db.get(RefreshSession, UUID(claims["sid"]))
        if (
            user is None
            or session is None
            or session.user_id != user.id
            or session.revoked_at is not None
            or _aware(session.expires_at) <= now_utc()
            or user.auth_version != claims["auth_version"]
        ):
            raise jwt.InvalidTokenError("revoked")
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise AuthProblem(401, "Invalid session") from exc
    return user
