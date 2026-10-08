# Etapa antes — Segundo corte TDD de recordatorios

- Fecha: 7 de octubre de 2026
- Tarea: reminders-core-tdd
- Herramienta: Codex

## Prompt real del usuario

> PLEASE IMPLEMENT THIS PLAN:
> # Segundo corte TDD: núcleo de recordatorios
>
> ## Resumen
>
> Construir el recorrido **crear → programar → vencer → recibir un aviso dentro de la app**. El usuario podrá consultar, editar y cancelar recordatorios pendientes, y marcar avisos como leídos. Este corte no incorporará notas independientes, Web Push, envíos por WhatsApp ni correos. Se validará localmente y en CI, sin desplegar a producción.
>
> ## Datos, API y reglas
>
> - Añadir una migración aditiva posterior a `0002_auth` para `reminders` y `notifications`. Cada recordatorio pertenece a un usuario, conserva la fecha UTC, zona IANA, estado y versión. `notifications.reminder_id` será único. El campo `send_whatsapp` comenzará en `false` y no podrá activarse desde esta interfaz.
> - Crear endpoints autenticados para listar, crear, consultar, editar y cancelar recordatorios; y para listar avisos, consultar no leídos y marcar uno o todos como leídos. Las consultas se limitarán al usuario del JWT: un ID ajeno responderá 404. Las listas tendrán paginación por cursor y límite máximo de 100 elementos.
> - Recibir fecha, hora local con precisión de minutos y zona IANA; FastAPI calculará el instante UTC. Rechazar mensajes vacíos o de más de 280 caracteres, zonas inválidas y fechas que no sean futuras. Una hora inexistente avanzará al **primer instante válido**; una hora repetida elegirá la **segunda ocurrencia**. Añadir una operación de vista previa que devuelva la hora efectiva antes de guardar. Al editar la zona, se conservarán la fecha y hora locales, conforme a tu decisión.
> - Exigir `Idempotency-Key` UUID al crear: repetir clave y contenido devolverá el mismo recordatorio; reutilizarla con otro contenido responderá 409. Edición y cancelación exigirán la versión observada; una versión obsoleta o un estado distinto de `scheduled` responderá 409. No habrá borrado físico de recordatorios.
>
> ## Worker y web
>
> - Ejecutar el worker como proceso Python separado de la API. Consultará el reloj de PostgreSQL cada 10 segundos, reclamará lotes con `FOR UPDATE SKIP LOCKED` y una lease de 90 segundos, y recuperará reclamos vencidos tras reinicios. En una transacción creará como máximo una notificación interna por recordatorio y lo marcará `fired`. No hará llamadas externas. Añadir salud y preparación para su futura ejecución en Render, sin activarlo en producción.
> - Sustituir el dashboard vacío por listas de próximos, disparados y cancelados; formulario de creación y edición con resumen de hora efectiva; detalle; y bandeja con contador de no leídos. Mostrar el estado `processing` sin permitir editarlo. Adaptar el estilo existente tomando la [plantilla visual de Lovable](https://lovable.dev/templates/apps/saas/inspo-canvas-visual-moodboard-creator-template) como referencia, sin incorporar su canvas ni funciones de IA.
> - Crear endpoints BFF **explícitos** para esas operaciones. Mantener JWT y refresh tokens sólo en el servidor, validar `Origin` en mutaciones y comprobar mediante pruebas que el flujo sigue funcionando tras renovar la sesión.
>
> ## Ciclos TDD y aceptación
>
> 1. Pruebas fallidas de validación, zonas horarias, aislamiento entre usuarios, creación idempotente y conflictos de versión; después, migración, servicios y rutas hasta pasarlas.
> 2. Pruebas con PostgreSQL real para dos workers, caída tras reclamar, lease vencida y creación exactamente una vez del aviso; después, implementar el worker.
> 3. Pruebas de bandeja, lectura individual y masiva, BFF y formularios. Un E2E Playwright cubrirá **crear → vencer → ver aviso → marcar leído**, además de edición, cancelación y renovación de sesión. Añadir comprobación de accesibilidad al recorrido crítico.
> 4. Ejecutar formato, lint, tipos, pruebas, build, migración desde base vacía, `alembic check`, sincronización OpenAPI/cliente y regresión de autenticación y WhatsApp. Registrar prompts y tiempos reales; solicitar revisión independiente antes de aceptar el cambio.
>
> ## Supuestos y entrega
>
> La verificación y recuperación de cuenta con Resend continúan en su ciclo pendiente. Web Push y la conexión del recordatorio con el servicio WhatsApp tendrán cortes posteriores. El rollback detendrá el worker y restaurará las versiones anteriores de API y web; la migración aditiva dejará las tablas sin uso, sin borrarlas automáticamente. Se conservarán los cambios que ya existen sin commit en el checkout.

## Redacciones

Ninguna.
