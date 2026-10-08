"""Opted-in WhatsApp destinations and durable delivery attempts.

Revision ID: 0004_whatsapp_delivery
Revises: 0003_reminders
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0004_whatsapp_delivery"
down_revision = "0003_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_destinations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("phone_encrypted", sa.String(255)),
        sa.Column("phone_hash", sa.String(64)),
        sa.Column("masked_number", sa.String(20)),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("opted_in_at", sa.DateTime(timezone=True)),
        sa.Column("consent_text_version", sa.String(16)),
        sa.Column("disabled_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')", name="ck_whatsapp_destination_status"
        ),
        sa.CheckConstraint(
            "status != 'active' OR (phone_encrypted IS NOT NULL AND phone_hash IS NOT NULL AND masked_number IS NOT NULL AND opted_in_at IS NOT NULL)",
            name="ck_whatsapp_active_fields",
        ),
    )
    op.create_index(
        "uq_whatsapp_active_phone",
        "whatsapp_destinations",
        ["phone_hash"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "delivery_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "reminder_id",
            sa.Uuid(),
            sa.ForeignKey("reminders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("destination_key", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.Column("provider_message_id", sa.String(255)),
        sa.Column("last_error_code", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "reminder_id", "channel", "destination_key", name="uq_delivery_target"
        ),
        sa.CheckConstraint("channel = 'whatsapp'", name="ck_delivery_channel"),
        sa.CheckConstraint(
            "status IN ('pending', 'sending', 'accepted', 'failed', 'unknown', 'canceled')",
            name="ck_delivery_status",
        ),
    )
    op.create_index(
        "ix_delivery_dispatch", "delivery_attempts", ["status", "next_attempt_at"]
    )
    op.create_table(
        "whatsapp_dispatch_windows",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade requires a reviewed recovery plan")
