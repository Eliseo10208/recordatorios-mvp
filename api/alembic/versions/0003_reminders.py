"""Durable reminders and in-app notifications.

Revision ID: 0003_reminders
Revises: 0002_auth
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003_reminders"
down_revision = "0002_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reminders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.String(280), nullable=False),
        sa.Column("scheduled_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="scheduled"),
        sa.Column(
            "send_whatsapp", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("fired_at", sa.DateTime(timezone=True)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("create_hash", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "user_id", "idempotency_key", name="uq_reminders_create_key"
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'processing', 'fired', 'canceled')",
            name="ck_reminders_status",
        ),
    )
    op.create_index(
        "ix_reminders_owner_status_time",
        "reminders",
        ["user_id", "status", "scheduled_at_utc"],
    )
    op.create_index(
        "ix_reminders_due",
        "reminders",
        ["scheduled_at_utc"],
        postgresql_where=sa.text("status = 'scheduled'"),
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reminder_id",
            sa.Uuid(),
            sa.ForeignKey("reminders.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.String(280), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_notifications_owner_created", "notifications", ["user_id", "created_at"]
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade requires a reviewed recovery plan")
