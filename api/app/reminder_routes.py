"""Explicit protected HTTP endpoints for reminders and the inbox."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.orm import Session

from app.current_user import current_user
from app.db import User, get_db
from app.notification_service import (
    list_notifications,
    read_all,
    read_one,
    unread_count,
)
from app.reminder_schemas import (
    NotificationPage,
    ReminderCreate,
    ReminderPage,
    ReminderPatch,
    ReminderPublic,
    ScheduleInput,
    SchedulePreview,
    UnreadCount,
    VersionInput,
)
from app.reminder_service import (
    cancel_reminder,
    create_reminder,
    delete_reminder,
    edit_reminder,
    list_reminders,
    owned,
    preview,
    public_reminder,
)
from app.schemas import Problem

router = APIRouter(
    prefix="/api/v1",
    responses={
        code: {
            "description": "Problem response",
            "content": {
                "application/problem+json": {"schema": Problem.model_json_schema()}
            },
        }
        for code in (401, 404, 409, 422)
    },
)
Db = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(current_user)]
Limit = Annotated[int, Query(ge=1, le=100)]


@router.post("/reminders/preview", response_model=SchedulePreview)
def preview_route(body: ScheduleInput, db: Db, _user: Owner) -> SchedulePreview:
    return preview(db, body)


@router.post("/reminders", response_model=ReminderPublic, status_code=201)
def create_route(
    body: ReminderCreate,
    db: Db,
    user: Owner,
    response: Response,
    idempotency_key: Annotated[UUID, Header(alias="Idempotency-Key")],
) -> ReminderPublic:
    result, created = create_reminder(db, user, body, idempotency_key)
    if not created:
        response.status_code = 200
    return result


@router.get("/reminders", response_model=ReminderPage)
def list_route(
    db: Db,
    user: Owner,
    status: Literal["upcoming", "fired", "canceled"] = "upcoming",
    limit: Limit = 50,
    cursor: str | None = None,
) -> ReminderPage:
    return list_reminders(db, user, status, limit, cursor)


@router.get("/reminders/{reminder_id}", response_model=ReminderPublic)
def get_route(reminder_id: UUID, db: Db, user: Owner) -> ReminderPublic:
    return public_reminder(owned(db, user, reminder_id))


@router.patch("/reminders/{reminder_id}", response_model=ReminderPublic)
def edit_route(
    reminder_id: UUID, body: ReminderPatch, db: Db, user: Owner
) -> ReminderPublic:
    return edit_reminder(db, user, reminder_id, body)


@router.post("/reminders/{reminder_id}/cancel", response_model=ReminderPublic)
def cancel_route(
    reminder_id: UUID, body: VersionInput, db: Db, user: Owner
) -> ReminderPublic:
    return cancel_reminder(db, user, reminder_id, body.expected_version)


@router.delete("/reminders/{reminder_id}", status_code=204)
def delete_route(
    reminder_id: UUID, body: VersionInput, db: Db, user: Owner
) -> Response:
    delete_reminder(db, user, reminder_id, body.expected_version)
    return Response(status_code=204)


@router.get("/notifications", response_model=NotificationPage)
def notifications_route(
    db: Db, user: Owner, limit: Limit = 50, cursor: str | None = None
) -> NotificationPage:
    return list_notifications(db, user, limit, cursor)


@router.get("/notifications/unread-count", response_model=UnreadCount)
def unread_route(db: Db, user: Owner) -> UnreadCount:
    return unread_count(db, user)


@router.post("/notifications/read-all", status_code=204)
def read_all_route(db: Db, user: Owner) -> Response:
    read_all(db, user)
    return Response(status_code=204)


@router.post("/notifications/{notification_id}/read", status_code=204)
def read_one_route(notification_id: UUID, db: Db, user: Owner) -> Response:
    read_one(db, user, notification_id)
    return Response(status_code=204)
