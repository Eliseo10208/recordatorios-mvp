---
name: clean-api-web
description: Ejecuta las verificaciones del repositorio Recordatorios antes de un push o PR, incluidas las pruebas de API, web y WhatsApp, integración, E2E y checks de CI. Úsala cuando pidan validar que la rama está lista para subir.
---

# Clean API Web

Trabaja desde la raíz de este repositorio. Lee `git status`, `CLAUDE.md` y `.github/workflows/ci.yml` antes de ejecutar nada: si cambia CI, ajusta esta secuencia a los checks vigentes. Conserva los cambios locales. La skill ejecuta verificaciones y reporta resultados; no hace commit ni push por sí sola.

## Límite de líneas y JavaScript/TypeScript

Ejecuta desde la raíz, comprobando el código de salida de cada comando:

```bash
python -m unittest discover -s scripts -p 'test_*.py'
python scripts/check_source_lines.py
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` y `pnpm build` recorren `web/` y `whatsapp/`. Las pruebas de persistencia de WhatsApp se omiten sin `TEST_DATABASE_URL`; registra esa omisión como validación pendiente.

## API Python

Desde `api/`, ejecuta:

```bash
uv sync --frozen
uv run --frozen ruff format --check app tests scripts alembic/env.py alembic/versions/0002_auth.py
uv run --frozen ruff check app tests scripts alembic/env.py alembic/versions/0002_auth.py
uv run --frozen pyright
uv run --frozen python -m pytest -q
```

Si `uv` falta, usa el Python del entorno virtual para los checks posibles e indica cuáles quedaron sin ejecutar. No sustituyas una prueba PostgreSQL omitida por una prueba SQLite.

## Integración, contratos y navegador

Antes de aplicar migraciones, verifica sin imprimir credenciales que `TEST_DATABASE_URL` y `MIGRATION_DATABASE_URL` apunten a la misma base **local y dedicada**, con `_test` en el nombre. Entonces ejecuta `uv run --frozen alembic upgrade head` y `uv run --frozen alembic check` desde `api/`, y repite `pytest` y `pnpm test` con la base configurada. Nunca apliques migraciones a una base no verificada ni envíes correos o WhatsApp reales.

Regenera OpenAPI con `uv run --frozen python -m scripts.export_openapi` desde `api/` y el cliente con `pnpm --filter @recordatorios/web api:generate` desde la raíz. Comprueba que ambos archivos generados conservan su contenido esperado. Si están rastreados por Git, usa `git diff --exit-code -- api/openapi.json web/src/lib/api-types.ts`; si aún son archivos nuevos, compara sus hashes antes y después. No descartes un diff inesperado.

Con PostgreSQL de prueba, el build web terminado y Chromium instalado, ejecuta `uv run --frozen python -m scripts.run_auth_e2e` desde `api/`. Si falta el navegador, instálalo con el comando de Playwright apropiado para el sistema y repite la prueba.

## Resultado

Reporta cada comando como aprobado, fallido u omitido, con el error concreto y la causa de cualquier omisión. Una suite con pruebas omitidas no equivale a una validación completa. Declara la rama lista para push sólo cuando pasen todos los checks aplicables. Si también te pidieron hacer push, detente antes de hacerlo ante un fallo o una validación incompleta.
