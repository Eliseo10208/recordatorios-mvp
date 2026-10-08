"""Single-use verification and password recovery tokens.

Revision ID: 0005_account_tokens
Revises: 0004_whatsapp_delivery
"""

import sqlalchemy as sa

from alembic import op

revision = "0005_account_tokens"
down_revision = "0004_whatsapp_delivery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "purpose IN ('verify_email', 'reset_password')",
            name="ck_account_token_purpose",
        ),
    )
    op.create_index(
        "ix_account_tokens_user_purpose", "account_tokens", ["user_id", "purpose"]
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade requires a reviewed recovery plan")
