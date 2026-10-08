"""HTTP transport for account authentication."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth_service import (
    AuthProblem,
    authenticate_access,
    login,
    logout,
    public_user,
    refresh,
    register,
)
from app.db import get_db
from app.reminder_routes import router as reminder_router
from app.schemas import Credentials, Problem, RefreshRequest, TokenPair, UserPublic
from app.settings import Settings, get_settings
from app.whatsapp_routes import router as whatsapp_router

app = FastAPI(title="Recordatorios API", version="0.2.0")
app.include_router(reminder_router)
app.include_router(whatsapp_router)
Db = Annotated[Session, Depends(get_db)]
Config = Annotated[Settings, Depends(get_settings)]


@app.get("/healthz")
def health() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/readyz")
def ready(db: Db, response: Response) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = 503
        return {"status": "unready"}
    return {"status": "ready"}


def problem_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    return {
        code: {
            "description": "Problem response",
            "content": {
                "application/problem+json": {"schema": Problem.model_json_schema()}
            },
        }
        for code in codes
    }


@app.middleware("http")
async def request_id(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request.state.trace_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.trace_id
    return response


@app.exception_handler(AuthProblem)
def auth_error(request: Request, exc: AuthProblem) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": exc.title,
            "status": exc.status,
            "detail": exc.title,
            "instance": str(request.url.path),
            "traceId": request.state.trace_id,
        },
    )


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, _exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Invalid request",
            "status": 422,
            "detail": "Request payload failed validation",
            "instance": str(request.url.path),
            "traceId": request.state.trace_id,
        },
    )


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@app.post(
    "/api/v1/auth/register",
    status_code=201,
    response_model=UserPublic,
    responses=problem_responses(409, 422, 429),
)
def register_route(
    body: Credentials, request: Request, db: Db, settings: Config
) -> UserPublic:
    return public_user(
        register(db, settings, str(body.email), body.password, client_ip(request))
    )


@app.post(
    "/api/v1/auth/login",
    response_model=TokenPair,
    responses=problem_responses(401, 422, 429),
)
def login_route(
    body: Credentials, request: Request, db: Db, settings: Config
) -> TokenPair:
    return login(db, settings, str(body.email), body.password, client_ip(request))


@app.post(
    "/api/v1/auth/refresh",
    response_model=TokenPair,
    responses=problem_responses(401, 422, 429),
)
def refresh_route(
    body: RefreshRequest, request: Request, db: Db, settings: Config
) -> TokenPair:
    return refresh(db, settings, body.refresh_token, client_ip(request))


@app.post("/api/v1/auth/logout", status_code=204, responses=problem_responses(422))
def logout_route(body: RefreshRequest, db: Db, settings: Config) -> Response:
    logout(db, settings, body.refresh_token)
    return Response(status_code=204)


@app.get("/api/v1/auth/me", response_model=UserPublic, responses=problem_responses(401))
def me_route(
    db: Db, settings: Config, authorization: Annotated[str | None, Header()] = None
) -> UserPublic:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthProblem(401, "Invalid session")
    return public_user(
        authenticate_access(db, settings, authorization.removeprefix("Bearer "))
    )
