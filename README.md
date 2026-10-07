# Recordatorios

Aplicación web para programar recordatorios personales. Cada recordatorio crea
un aviso dentro de la app y, de forma opcional, puede generar una notificación
Web Push y una copia por WhatsApp.

WhatsApp funciona con un único emisor conectado y administrado por el equipo.
Los usuarios no conectan sus cuentas: sólo registran el número donde quieren
recibir avisos y aceptan ese canal. Al vencer un recordatorio, el worker envía
al servicio central el número y el mensaje correspondientes.

## Estado

La primera entrega implementa el servicio `whatsapp/`, su contrato HTTP y la
migración inicial. El backend, el worker y la interfaz web siguen pendientes.
No hay un emisor desplegado hasta aplicar la migración, vincular la sesión y
configurar Render.

## Flujo del MVP

```text
crear recordatorio
  → guardarlo en PostgreSQL
  → worker reclama el vencimiento
  → crear notificación interna
  → intentar Web Push si existe permiso
  → enviar { phone, message } al servicio WhatsApp si el usuario lo activó
```

La notificación interna es la fuente de verdad. Un fallo de Push o WhatsApp no
elimina el recordatorio ni la notificación de la app.

## Stack previsto

- Next.js, React y TypeScript para frontend y BFF.
- FastAPI, Pydantic y Python para API y reglas de negocio.
- PostgreSQL, SQLAlchemy y Alembic para persistencia y migraciones.
- Worker Python durable para programación y entregas.
- Servicio TypeScript/Node.js con Baileys como emisor central de WhatsApp.
- Vercel, Render y Neon como destinos de despliegue.

La aplicación desplegada no utiliza IA, RAG, embeddings ni agentes. La IA se
usa únicamente para apoyar el proceso de desarrollo.

## Documentación

- [Especificación del MVP](docs/specs/MVP_RECORDATORIOS.md)
- [ADR: WhatsApp centralizado](docs/adr/ADR-0001-whatsapp-centralizado.md)
- [Contrato HTTP del emisor](docs/contracts/WHATSAPP_V1.md)
- [Reglas para desarrollo asistido por IA](CLAUDE.md)
- [Registro de prompts y tiempos](prompts/README.md)

## Servicio WhatsApp local

Requiere Node.js 24, pnpm 11.19, Python 3.13, uv y PostgreSQL. Copia
`whatsapp/.env.example` a `whatsapp/.env` y configura secretos reales fuera de
Git. `DATABASE_URL` debe ser la conexión **directa** de Neon: el bloqueo de
sesión usa una conexión PostgreSQL persistente y no funciona con el pooler.
Define `MIGRATION_DATABASE_URL` con esa misma conexión antes de ejecutar
Alembic; verifica el host y el nombre de base sin mostrar la contraseña.
`BAILEYS_ENCRYPTION_KEY` es una clave aleatoria de 32 bytes codificada en
base64; conserva la misma clave tras reinicios. `WHATSAPP_SERVICE_TOKEN` es
un secreto aleatorio de al menos 32 caracteres compartido sólo con el worker.

```bash
pnpm install --frozen-lockfile
cd api
uv sync --frozen
uv run alembic upgrade head
cd ../whatsapp
pnpm pair
```

El QR aparece sólo en el terminal local. Cierra `pnpm pair` antes de arrancar
el servicio en Render. Una vez vinculada la cuenta:

```bash
pnpm --filter @recordatorios/whatsapp typecheck
pnpm --filter @recordatorios/whatsapp test
pnpm --filter @recordatorios/whatsapp build
pnpm --filter @recordatorios/whatsapp start
```

`GET /healthz` comprueba el proceso; `GET /readyz` exige sesión conectada y
almacén de autenticación accesible. Las pruebas de PostgreSQL usan únicamente
`TEST_DATABASE_URL` apuntando a una base cuyo nombre contenga `_test`; CI crea
esa base y aplica Alembic antes de ejecutarlas. Las pruebas ordinarias nunca
envían mensajes reales. El despliegue Render se describe en `render.yaml` y
usa secretos configurados en el panel. La URL HTTPS la asigna Render; el
worker añadirá `/v1/messages` a esa URL.
