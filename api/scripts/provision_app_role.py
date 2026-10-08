"""Create a runtime role limited to the API and worker tables.

Requires MIGRATION_DATABASE_URL. APP_DB_PASSWORD is needed only for a new role.
Never prints secrets.
Run after migration 0005; existing roles receive only missing grants.
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit

import psycopg
from psycopg import sql

ROLE = "recordatorios_app"
TABLES = (
    "users",
    "refresh_sessions",
    "refresh_aliases",
    "auth_rate_limits",
    "account_tokens",
    "reminders",
    "notifications",
    "whatsapp_destinations",
    "delivery_attempts",
    "whatsapp_dispatch_windows",
)


def main() -> None:
    url = os.environ.get("MIGRATION_DATABASE_URL", "")
    password = os.environ.get("APP_DB_PASSWORD", "")
    parsed = urlsplit(url)
    if (
        parsed.scheme != "postgresql"
        or not parsed.hostname
        or not parsed.path.strip("/")
    ):
        raise RuntimeError("MIGRATION_DATABASE_URL must be a PostgreSQL connection URL")

    with psycopg.connect(url) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,)
        ).fetchone()
        if not exists:
            if len(password) < 32:
                raise RuntimeError(
                    "APP_DB_PASSWORD must be at least 32 characters when creating the role"
                )
            connection.execute(
                sql.SQL("CREATE ROLE {} WITH LOGIN PASSWORD {}").format(
                    sql.Identifier(ROLE), sql.Literal(password)
                )
            )
        connection.execute(
            sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(ROLE))
        )
        for table in TABLES:
            connection.execute(
                sql.SQL(
                    "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {} TO {}"
                ).format(sql.Identifier("public", table), sql.Identifier(ROLE))
            )


if __name__ == "__main__":
    main()
