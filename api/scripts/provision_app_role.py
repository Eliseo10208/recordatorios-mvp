"""Create a runtime role limited to the API and worker tables.

Requires MIGRATION_DATABASE_URL and APP_DB_PASSWORD. Never prints secrets.
Run once after migration 0004; the migration owner stays outside Render.
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
    if len(password) < 32:
        raise RuntimeError("APP_DB_PASSWORD must be at least 32 characters")

    with psycopg.connect(url) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,)
        ).fetchone()
        if exists:
            raise RuntimeError(
                "App role already exists; refusing to rotate its password"
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
