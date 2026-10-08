# Eliminar recordatorios — durante

- Fecha: 2026-10-08
- Tarea: eliminación lógica de recordatorios
- Herramienta: Codex
- Prompt real del usuario para la implementación:

> PLEASE IMPLEMENT THIS PLAN:
> # Eliminar recordatorios de la interfaz
>
> ## Resumen
>
> Añadir la opción **Eliminar** para recordatorios programados, disparados y cancelados. La eliminación será lógica: el recordatorio y su aviso dejarán de aparecer en la app, mientras sus registros permanecerán en PostgreSQL. Los recordatorios en estado `processing` responderán con conflicto hasta que el worker termine.
>
> ## Cambios
>
> - Añadir `deleted_at` mediante una migración aditiva. `DELETE /api/v1/reminders/{reminder_id}` exigirá `{ "expected_version": número }`, como las operaciones actuales de edición y cancelación. Devolverá `204` al eliminar, `404` si el recurso es ajeno, inexistente o ya está oculto, `409` si la versión cambió o está procesándose, y `422` ante una entrada inválida.
> - Excluir los registros ocultos de las listas y del detalle, y sus avisos de la bandeja, el contador de no leídos y las operaciones de lectura. Una clave de idempotencia usada para crear un recordatorio oculto seguirá reservada: reutilizarla devolverá `409`, sin restaurarlo.
> - Impedir que el worker procese recordatorios ocultos y cancelar sus intentos de WhatsApp aún pendientes. El despacho comprobará `deleted_at` antes de iniciar una solicitud. Un envío que ya esté en curso podría terminar; se conservará su resultado interno.
> - Añadir `DELETE /api/reminders/{id}` al BFF con validación de `Origin`. Mostrar **Eliminar** en el detalle, con confirmación clara de que desaparecerán también sus avisos. Tras eliminar, actualizar lista y contador. Mantener **Cancelar** como acción distinta para los programados. Actualizar la spec, OpenAPI y el cliente TypeScript.
>
> ## TDD y validación
>
> - Escribir primero pruebas fallidas de permisos, versiones, estados permitidos, doble eliminación, idempotencia y exclusión de listas, avisos y contador; implementar hasta que pasen.
> - Probar con PostgreSQL real las carreras entre eliminación, worker y despacho de WhatsApp. Añadir pruebas del BFF y un recorrido Playwright que elimine un programado y un disparado con aviso, incluyendo accesibilidad de la confirmación.
> - Ejecutar formato, lint, tipos, pruebas, build, migración desde una base vacía, `alembic check` y sincronización OpenAPI/cliente. Registrar prompts y tiempos reales y solicitar revisión independiente.
>
> ## Supuestos
>
> No habrá restauración desde la interfaz ni borrado físico en este corte. No se desplegará como parte de este cambio.

No se redactó contenido.
