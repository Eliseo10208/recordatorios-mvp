# Recordatorios

Aplicación web para programar recordatorios personales. Cada recordatorio crea
un aviso dentro de la app y, de forma opcional, puede generar una notificación
Web Push y una copia por WhatsApp.

WhatsApp usa un único emisor conectado y administrado por el equipo.
Los usuarios no conectan sus cuentas: sólo registran el número donde quieren
recibir avisos y aceptan ese canal. El worker consume su contrato HTTP.

## Estado

El emisor `whatsapp/` ya está desplegado en Render. Este corte integra registro,
inicio de sesión, programación, bandeja interna y envíos de WhatsApp desde el
worker. El frontend queda versionado, sin despliegue en Vercel por ahora.
Web Push, verificación de correo y recuperación de contraseña siguen pendientes.

## Flujo previsto del MVP

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
Después de la migración, `api/scripts/provision_whatsapp_role.py` crea el rol
`whatsapp_sender` con acceso únicamente a las tres tablas del emisor. Requiere
`MIGRATION_DATABASE_URL` y una contraseña aleatoria en
`WHATSAPP_DB_PASSWORD`; no imprime ninguno de los dos valores. Usa la URL
directa de ese rol como `whatsapp/DATABASE_URL` en local y Render. La URL del
propietario se reserva para migraciones.

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

`pnpm --filter @recordatorios/whatsapp db:check` verifica la conexión del rol
restringido y la lectura del almacén cifrado sin imprimir credenciales.

`GET /healthz` comprueba el proceso; `GET /readyz` exige sesión conectada y
almacén de autenticación accesible. Las pruebas de PostgreSQL usan únicamente
`TEST_DATABASE_URL` apuntando a una base cuyo nombre contenga `_test`; CI crea
esa base y aplica Alembic antes de ejecutarlas. Las pruebas ordinarias nunca
envían mensajes reales. El despliegue Render se describe en `render.yaml` y
usa secretos configurados en el panel. La URL HTTPS la asigna Render; el
worker añadirá `/v1/messages` a esa URL.

## Primer corte de cuentas

`api/` implementa registro, login, renovación, logout y perfil autenticado.
`web/` usa Auth.js para la sesión del navegador y endpoints BFF explícitos.
El registro inicia sesión automáticamente. El correo queda pendiente de
verificación: el envío con Resend y la recuperación de contraseña son la
siguiente entrega. Este corte no envía emails reales.

Configura `api/.env.example` y `web/.env.example` fuera de Git. La API necesita
un par RSA para JWT RS256; los PEM pueden pasarse en variables de entorno con
saltos de línea representados por `\n`. `REFRESH_SECRET` y `AUTH_SECRET` son
secretos distintos. `JWT_ACCESS_SECONDS` vale 900 en uso normal y el refresh
vence a los siete días desde el login. `WEB_ORIGIN` debe coincidir exactamente
con el origen público del frontend. La API no necesita CORS para la web: el
navegador llama al BFF.

Antes de aplicar Alembic, confirma que `MIGRATION_DATABASE_URL` apunta a la base
local correcta. Luego ejecuta:

```bash
cd api
uv sync --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

cd ../web
pnpm install --frozen-lockfile
pnpm dev
```

Los controles de auth usan una base cuyo nombre contenga `_test`; el runner
`uv run python -m scripts.run_auth_e2e` crea claves sintéticas en memoria y
ejecuta Playwright contra esa base después de aplicar migraciones y construir
la web. No usa la API key de Resend ni datos productivos.

El despliegue de este corte requiere configurar los secretos y URL de ambos
procesos, aplicar `0002_auth` con un job de migración único y comprobar el
origen público antes de habilitar tráfico. En Render debe verificarse qué IP
observa FastAPI detrás del proxy para que los límites compartidos no agrupen
usuarios distintos; no se confía en cabeceras reenviadas sin un proxy de
confianza. Una cookie antigua que reaparezca más de 30 segundos después de
rotar su refresh token puede exigir iniciar sesión otra vez. Para revertir el
corte, vuelve a las versiones anteriores de `web/` y `api/`; las tablas nuevas
pueden quedar sin uso. La migración no incluye un downgrade destructivo.

## Núcleo de recordatorios

La API recibe mensaje (1–280 caracteres), fecha local, hora `HH:mm` y zona
IANA. `POST /api/v1/reminders/preview` muestra la hora efectiva antes de
guardar. La creación usa `Idempotency-Key` UUID; edición y cancelación exigen
la versión actual. Un ID de otro usuario responde 404. Las listas usan cursor.

`0003_reminders` crea `reminders` y `notifications` sin borrar datos previos.
El worker corre como proceso separado de la API y crea avisos internos;
consulta PostgreSQL cada 10 segundos por defecto y recupera reclamos cuya
lease venció tras un reinicio. WhatsApp es opcional y se describe abajo. No envía Push ni email.

```bash
cd api
uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000
# En otra terminal, con DATABASE_URL configurada:
uv run uvicorn app.worker_app:app --port 8001
```

`GET /healthz` indica que el proceso del worker está vivo y `GET /readyz`
confirma que completó un ciclo reciente. La API tiene las mismas rutas:
`/healthz` responde sin consultar la base y `/readyz` devuelve 503 cuando
PostgreSQL no responde. Para probarlo localmente, usa una
base cuyo nombre contenga `_test`, construye `web/` y ejecuta
`uv run python -m scripts.run_auth_e2e`; el runner arranca API, worker y web
con claves sintéticas. El despliegue del worker en Render se define en
`render.yaml`. En rollback, detén el worker y vuelve a
las versiones anteriores de API y web; conserva las tablas para una revisión
posterior, sin ejecutar un downgrade destructivo.

## Avisos por WhatsApp

`0004_whatsapp_delivery` añade destinos cifrados e intentos de envío. Cada
usuario registra un número E.164 con consentimiento explícito v1. La API
devuelve sólo los últimos cuatro dígitos; al desactivar el canal borra el
número cifrado y quita la preferencia de los recordatorios futuros. No hay
verificación de propiedad del número por OTP en este corte.
Para México, `+52` y `+521` seguidos de los mismos diez dígitos se guardan
como `+52`; ambos formatos ocupan el mismo destino activo único. El emisor
añade el `1` requerido al construir el identificador de WhatsApp.

`WHATSAPP_PHONE_KEY` es una clave aleatoria de **32 bytes en base64** y debe
ser idéntica en API y worker. No debe cambiarse mientras existan destinos
activos: no se podrían descifrar ni comparar. `WHATSAPP_ENABLED=true` habilita
el canal; sin él, los avisos internos continúan. Sólo el worker recibe
`WHATSAPP_SERVICE_TOKEN` y `WHATSAPP_API_URL`; el token debe tener al menos
32 caracteres y la URL debe ser HTTPS. Configuración parcial impide iniciar
el despacho. La URL del emisor desplegado es
`https://recordatorios-whatsapp-kxia.onrender.com`. Los secretos se pasan por
variables de entorno fuera del repositorio, nunca al navegador.

Tras crear el aviso interno, el worker envía `POST /v1/messages` con una clave
de idempotencia UUID estable. Una aceptación significa que el servicio
recibió la solicitud; **no confirma la entrega al teléfono**. Sólo se
reintentan 429 y 503; un timeout, 502 o lease vencida queda como resultado
desconocido para evitar duplicados. El envío se limita a 20 solicitudes por
minuto en PostgreSQL. La API y el worker se despliegan por separado desde
`main`, después de revisión humana y migraciones aplicadas una sola vez.

## Despliegue de API y worker

`render.yaml` define dos Web Services Free con raíz `api/` y Python 3.13.
El servicio API ejecuta `app.main:app`; el worker ejecuta `app.worker_app:app`
y consulta vencimientos cada diez segundos mientras esté activo. Ambos usan
la conexión **directa** de Neon de `recordatorios_app`, nunca la credencial de
migración. Antes de desplegar, crea un punto de recuperación en Neon, comprueba
que `alembic_version` sea `0001_whatsapp`, aplica `0002`–`0004` una vez con
`MIGRATION_DATABASE_URL` fuera de Render y verifica `0004_whatsapp_delivery`.

Después de migrar, ejecuta `api/scripts/provision_app_role.py` con
`MIGRATION_DATABASE_URL` y `APP_DB_PASSWORD` aleatoria de al menos 32
caracteres. El rol sólo obtiene permisos sobre usuarios, sesiones de la app,
recordatorios, avisos, destinos y ledger; no puede leer las tres tablas de
Baileys. Verifica sus permisos antes de configurar `DATABASE_URL`.

Configura `DATABASE_URL` y `WHATSAPP_PHONE_KEY` con el mismo valor en API y
worker. Sólo la API necesita `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KID`,
`JWT_ISSUER`, `JWT_AUDIENCE` y `REFRESH_SECRET`. Sólo el worker necesita
`WHATSAPP_API_URL` y `WHATSAPP_SERVICE_TOKEN`. No copies secretos al repositorio
ni al frontend. Después de que Render asigne las URL, configura las variables
`API_HEALTH_URL` y `WORKER_HEALTH_URL` en GitHub y revisa `/readyz` en ambos
servicios. Una ejecución manual del workflow no demuestra que `schedule` haya
funcionado; comprueba un evento programado real.
Si el Blueprint de WhatsApp ya existe, Render ignora las nuevas variables
`sync: false` al sincronizarlo: añade los secretos de API y worker en el panel
de cada servicio antes de activarlos.

Para una prueba real, configura el token localmente, registra en la app un
número que controles, crea un recordatorio próximo y comprueba el aviso
interno y el estado `accepted`. Esa prueba no forma parte de CI. Para
revertir el corte, detén el worker y restaura API y web anteriores; deja las
tablas aditivas sin uso hasta revisión, sin ejecutar un downgrade destructivo.

## Pruebas y límite de archivos

CI ejecuta las pruebas unitarias de `api/`, `web/` y `whatsapp/`, además de la
verificación de que cada archivo fuente escrito a mano tenga como máximo 500
líneas. El cliente `web/src/lib/api-types.ts` se genera desde OpenAPI y queda
excluido del límite. Para comprobarlo localmente desde la raíz:

```bash
python -m unittest discover -s scripts -p 'test_*.py'
python scripts/check_source_lines.py
pnpm test
cd api && uv run --frozen python -m pytest -q
```

Cuando se corrija un bug, añade primero una prueba que reproduzca el fallo y
conserva esa prueba para detectar futuras regresiones.

Durante la semana de prueba, `.github/workflows/keepalive.yml` consulta las
rutas `/healthz` cada cinco minutos. Se activa con la variable de repositorio
`KEEPALIVE_ACTIVE=true` y las URLs base `WHATSAPP_HEALTH_URL`, `API_HEALTH_URL`
y `WORKER_HEALTH_URL` cuando cada servicio exista. Se desactiva quitando la
variable activa al terminar la semana. GitHub puede retrasar u omitir
ejecuciones programadas; este mecanismo no garantiza disponibilidad ni
puntualidad de los recordatorios.
