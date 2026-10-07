"""Encrypted Baileys state and send-request ledger.

Revision ID: 0001_whatsapp
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_whatsapp"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "baileys_auth",
        sa.Column("session_id", sa.Text(), primary_key=True),
        sa.Column("creds_ciphertext", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "baileys_signal_keys",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.Text(), sa.ForeignKey("baileys_auth.session_id", ondelete="CASCADE"), nullable=False),
        sa.Column("key_type", sa.Text(), nullable=False),
        sa.Column("key_id", sa.Text(), nullable=False),
        sa.Column("value_ciphertext", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("session_id", "key_type", "key_id", name="uq_baileys_signal_key"),
    )
    op.create_table(
        "whatsapp_send_requests",
        sa.Column("request_key", sa.Uuid(), primary_key=True),
        sa.Column("payload_hash", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("provider_message_id", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('sending', 'accepted', 'unknown')", name="ck_whatsapp_request_status"),
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade requires a reviewed recovery plan")
