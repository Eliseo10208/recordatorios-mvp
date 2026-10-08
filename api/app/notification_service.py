"""User-owned in-app inbox queries and read receipts."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.orm import Session

from app.auth_service import AuthProblem
from app.db import Notification, Reminder, User
from app.pagination import decode_cursor, encode_cursor
from app.reminder_schemas import NotificationPage, NotificationPublic, UnreadCount
from app.reminder_service import aware, database_now


def public_notification(row: Notification) -> NotificationPublic:
    return NotificationPublic(
        id=row.id,
        reminder_id=row.reminder_id,
        title=row.title,
        body=row.body,
        created_at=aware(row.created_at),
        read_at=aware(row.read_at) if row.read_at else None,
    )


def list_notifications(
    db: Session, user: User, limit: int, cursor: str | None
) -> NotificationPage:
    query = (
        select(Notification)
        .join(Reminder, Reminder.id == Notification.reminder_id)
        .where(Notification.user_id == user.id, Reminder.deleted_at.is_(None))
    )
    if cursor:
        at, item_id = decode_cursor(cursor, "notifications")
        query = query.where(
            or_(
                Notification.created_at < at,
                and_(Notification.created_at == at, Notification.id < item_id),
            )
        )
    rows = list(
        db.scalars(
            query.order_by(
                Notification.created_at.desc(), Notification.id.desc()
            ).limit(limit + 1)
        )
    )
    items = rows[:limit]
    next_cursor = (
        encode_cursor("notifications", aware(items[-1].created_at), items[-1].id)
        if len(rows) > limit
        else None
    )
    return NotificationPage(
        items=[public_notification(row) for row in items], next_cursor=next_cursor
    )


def unread_count(db: Session, user: User) -> UnreadCount:
    count = db.scalar(
        select(func.count(Notification.id))
        .join(Reminder, Reminder.id == Notification.reminder_id)
        .where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
            Reminder.deleted_at.is_(None),
        )
    )
    return UnreadCount(count=count or 0)


def read_one(db: Session, user: User, notification_id: UUID) -> None:
    row = db.scalar(
        select(Notification)
        .join(Reminder, Reminder.id == Notification.reminder_id)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
            Reminder.deleted_at.is_(None),
        )
    )
    if row is None:
        raise AuthProblem(404, "Notification not found")
    if row.read_at is None:
        row.read_at = database_now(db)
        db.commit()


def read_all(db: Session, user: User) -> None:
    db.execute(
        update(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
            Notification.reminder_id.in_(
                select(Reminder.id).where(Reminder.deleted_at.is_(None))
            ),
        )
        .values(read_at=database_now(db))
    )
    db.commit()
