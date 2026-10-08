"""Canonical reminder and inbox request/response types."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

Status = Literal["scheduled", "processing", "fired", "canceled"]
WhatsAppStatus = Literal[
    "pending", "sending", "accepted", "failed", "unknown", "canceled"
]
Resolution = Literal["exact", "gap_forward", "overlap_later"]


class ScheduleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    local_date: date
    local_time: str
    timezone: str = Field(min_length=1, max_length=100)

    @field_validator("local_time")
    @classmethod
    def minute_clock(cls, value: str) -> str:
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("Use HH:mm")
        return value


class ReminderCreate(ScheduleInput):
    message: str = Field(min_length=1, max_length=280)
    send_whatsapp: bool = False

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message is required")
        return value


class ReminderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    message: str | None = Field(default=None, min_length=1, max_length=280)
    local_date: date | None = None
    local_time: str | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=100)
    send_whatsapp: bool | None = None

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Message is required")
        return value

    @field_validator("local_time")
    @classmethod
    def minute_clock(cls, value: str | None) -> str | None:
        if value is not None:
            return ScheduleInput.minute_clock(value)
        return None


class VersionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)


class SchedulePreview(BaseModel):
    scheduled_at_utc: datetime
    local_date: str
    local_time: str
    timezone: str
    resolution: Resolution


class ReminderPublic(SchedulePreview):
    id: UUID
    message: str
    status: Status
    send_whatsapp: bool
    whatsapp_status: WhatsAppStatus | None
    version: int
    created_at: datetime
    fired_at: datetime | None
    canceled_at: datetime | None


class ReminderPage(BaseModel):
    items: list[ReminderPublic]
    next_cursor: str | None


class NotificationPublic(BaseModel):
    id: UUID
    reminder_id: UUID
    title: str
    body: str
    created_at: datetime
    read_at: datetime | None


class NotificationPage(BaseModel):
    items: list[NotificationPublic]
    next_cursor: str | None


class UnreadCount(BaseModel):
    count: int
