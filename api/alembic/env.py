"""Database migrations. Only MIGRATION_DATABASE_URL may select a target."""

from __future__ import annotations

import os
from logging.config import fileConfig
from urllib.parse import urlsplit

from alembic import context
from sqlalchemy import create_engine, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def database_url() -> str:
    value = os.environ.get("MIGRATION_DATABASE_URL")
    if not value:
        raise RuntimeError("MIGRATION_DATABASE_URL is required for migrations")
    parsed = urlsplit(value.replace("postgresql+psycopg://", "postgresql://", 1))
    if not parsed.hostname or not parsed.path or parsed.path == "/":
        raise RuntimeError("MIGRATION_DATABASE_URL needs a host and database")
    return value.replace("postgresql://", "postgresql+psycopg://", 1)


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
