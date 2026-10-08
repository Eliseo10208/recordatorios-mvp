# Estado de la entrega

Actualizado el 8 de octubre de 2026. Este documento distingue lo que existe en
`main`, lo que respondió en una comprobación HTTP puntual y lo que aún requiere
una prueba funcional en producción. La [especificación](specs/MVP_RECORDATORIOS.md)
describe también el diseño objetivo; no todo ese diseño está implementado.

## Accesos públicos

| Componente | Enlace | Comprobación puntual del 8 de octubre |
|---|---|---|
| Web | [Iniciar sesión](https://recordatorios-web-one.vercel.app/login) | `GET /login`: HTTP 200. |
| API | [Documentación OpenAPI](https://recordatorios-api.onrender.com/docs) | `GET /readyz`: HTTP 200. |
| Worker | [Disponibilidad](https://recordatorios-worker.onrender.com/readyz) | `GET /readyz`: HTTP 200. |
| Emisor WhatsApp | [Disponibilidad](https://recordatorios-whatsapp-kxia.onrender.com/readyz) | `GET /readyz`: HTTP 200. |
| PostgreSQL | Neon, sin enlace público a la base | [Esquema de migraciones](ESQUEMA_IMPLEMENTADO.md); no se consultó la base productiva para esta revisión. |

Estas respuestas confirman disponibilidad en ese instante. No demuestran por sí
solas que el registro, el correo, la programación ni la entrega de WhatsApp
funcionen de extremo a extremo con una cuenta real.

## Funciones del código actual

| Área | Implementado en `main` | Límite conocido |
|---|---|---|
| Cuenta | Registro, login, refresh, logout y perfil; verificación de correo, reenvío y recuperación de contraseña. | El envío real depende de Resend y su configuración productiva; no se hizo un envío en esta revisión. |
| Recordatorios | Vista previa de fecha/hora/zona, creación idempotente, listas por estado y cursor, detalle, edición, cancelación y eliminación lógica. | No hay notas independientes ni recordatorios recurrentes. |
| Interfaz | Login, registro, recuperación, verificación y dashboard adaptable con tarjetas, formulario, detalle, bandeja y configuración de WhatsApp. | La comprobación pública anterior sólo confirma que `/login` carga; las pantallas autenticadas requieren un recorrido con cuenta. |
| Avisos internos | Worker con reclamo durable; bandeja, contador y acciones para marcar uno o todos como leídos. | La puntualidad depende de que el worker permanezca activo; `/readyz=200` sólo indica un ciclo reciente. |
| WhatsApp | Un destino cifrado por usuario con consentimiento, preferencia por recordatorio, ledger y despacho al emisor central. | `accepted` significa aceptación del servicio, no entrega al teléfono. No se probó un mensaje real en esta revisión. |
| Web Push | No implementado. | No hay rutas, suscripciones, Service Worker ni tablas de Push. |
| Notas | No implementadas. | El enunciado de la prueba solicita notas y recordatorios; la entrega actual cubre recordatorios. |

### WhatsApp con cuentas separadas

Dos personas pueden iniciar sesión en cuentas distintas de **Recordatorios** y
guardar números receptores diferentes desde **Dashboard → WhatsApp**. La API
obtiene el usuario de la sesión autenticada (`current_user`) y guarda un único
destino por `user_id`. Un índice único impide que el mismo teléfono normalizado
esté activo en dos cuentas. Si una persona cambia su número, el nuevo reemplaza
al anterior; desactivarlo libera ese número para otra cuenta. El formulario
requiere consentimiento y el backend limita los cambios a cinco por hora.

Esta capacidad está cubierta por pruebas HTTP de aislamiento, conflicto,
desactivación y cambio de destino. En esta revisión no se usaron dos cuentas
reales en producción, por lo que no se confirma la configuración productiva
de `WHATSAPP_ENABLED` y `WHATSAPP_PHONE_KEY`. El `readyz` del emisor sólo
confirma la disponibilidad de la sesión central en ese instante.
En una comprobación pública del 8 de octubre, `/register` respondió 200 y
`GET /api/v1/notification-settings/whatsapp` sin credenciales respondió 401,
como corresponde a una ruta protegida; esto tampoco prueba el alta de un
destino autenticado.

Una persona **no puede iniciar sesión en su propia cuenta de WhatsApp como
emisor** desde la web. `whatsapp/` usa la sesión fija `central-sender`; el QR
de `pnpm pair` es una operación local del equipo. El número de usuario es sólo
el destino que recibe la copia. Tampoco existe verificación de propiedad por
OTP, así que el consentimiento por casilla no demuestra control del número.
Otro desarrollador puede vincular **su teléfono como nuevo emisor central** en
una instalación propia, o reemplazar el emisor de una instalación existente
tras retirar la sesión anterior. El procedimiento y sus límites están en
[WHATSAPP_EMISOR.md](operacion/WHATSAPP_EMISOR.md).

La eliminación lógica de `0006_reminder_soft_delete` oculta el recordatorio y sus
avisos al usuario, conserva las filas y cancela intentos de WhatsApp pendientes.
Un envío ya iniciado puede terminar. La UI muestra una confirmación antes de
eliminar y ofrece editar sólo cuando el estado es `scheduled`.

## API y datos

Las rutas implementadas están versionadas bajo `/api/v1` y documentadas en
[`api/openapi.json`](../api/openapi.json). Los grupos actuales son:

- `auth`: registro, login, refresh, logout, perfil, verificación y recuperación;
- `reminders`: vista previa, creación, lista, detalle, edición, cancelación y
  eliminación;
- `notifications`: lista, contador de no leídas y marcado como leídas;
- `notification-settings/whatsapp`: consulta, alta/cambio y desactivación del
  destino.

El navegador usa rutas BFF explícitas de Next.js; no llama directamente a
FastAPI ni al emisor WhatsApp. Alembic es la fuente de verdad del esquema. El
head del código es `0006_reminder_soft_delete` y hay 13 tablas documentadas en
[ESQUEMA_IMPLEMENTADO.md](ESQUEMA_IMPLEMENTADO.md). No se publica la cadena de
conexión de Neon ni se afirma que el `alembic_version` productivo se haya
comprobado desde esta revisión.

## Relación con la prueba técnica

El PDF de la prueba pide frontend, backend, base relacional, JWT, documentación
del esquema, prompts por etapas, log de tiempos y un proyecto de **notas y
recordatorios**. En el repositorio están el monorepo, la web y servicios
desplegados, JWT, migraciones, [`CLAUDE.md`](../CLAUDE.md) y
[`prompts/`](../prompts/README.md). El log conserva duraciones medidas cuando
existen y deja explícitas las etapas que no se midieron; no se estimaron horas.
Las notas siguen siendo una brecha funcional de la entrega.

## Comprobación y operación

- Para desarrollar localmente, sigue [README.md](../README.md) y los ejemplos
  `api/.env.example`, `web/.env.example` y `whatsapp/.env.example`.
- Para configurar servicios de otro desarrollador, consulta las guías de
  [WhatsApp](operacion/WHATSAPP_EMISOR.md), [Resend](operacion/RESEND.md) y
  [Neon](operacion/NEON.md).
- CI define jobs para líneas de fuente, API/web con PostgreSQL y E2E, y
  WhatsApp. El estado de cada ejecución se consulta en
  [GitHub Actions](https://github.com/Eliseo10208/recordatorios-mvp/actions).
- `/healthz` indica proceso vivo; `/readyz` exige condiciones adicionales. En
  el worker, `/readyz=200` indica que completó un ciclo recientemente.
- La prueba de envío a un teléfono y de correo transaccional requiere
  credenciales y destinatarios controlados; no forma parte de CI ni de esta
  comprobación documental.
