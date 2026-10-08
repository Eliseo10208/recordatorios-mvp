"""Create the restricted runtime role after migration 0001.

Requires MIGRATION_DATABASE_URL and WHATSAPP_DB_PASSWORD. The generated
password is supplied by the operator and is never printed by this script.
"""

from __future__ import annotations

import os
from urllib.parse import urlsplit

import psycopg
from psycopg import sql

ROLE = "whatsapp_sender"
TABLES = ("baileys_auth", "baileys_signal_keys", "whatsapp_send_requests")


def main() -> None:
    url = os.environ.get("MIGRATION_DATABASE_URL", "")
    password = os.environ.get("WHATSAPP_DB_PASSWORD", "")
    parsed = urlsplit(url)
    if (
        parsed.scheme != "postgresql"
        or not parsed.hostname
        or not parsed.path.strip("/")
    ):
        raise RuntimeError("MIGRATION_DATABASE_URL must be a PostgreSQL connection URL")
    if len(password) < 32:
        raise RuntimeError("WHATSAPP_DB_PASSWORD must be at least 32 characters")

    with psycopg.connect(url) as connection:
        exists = connection.execute(
            "SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,)
        ).fetchone()
        if exists:
            raise RuntimeError(
                "The WhatsApp role already exists; refusing to rotate its password"
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
