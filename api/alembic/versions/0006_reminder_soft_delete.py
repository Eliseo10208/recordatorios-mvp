"""Keep removed reminders and their delivery history out of user views.

Revision ID: 0006_reminder_soft_delete
Revises: 0005_account_tokens
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0006_reminder_soft_delete"
down_revision = "0005_account_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reminders", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade requires a reviewed recovery plan")
