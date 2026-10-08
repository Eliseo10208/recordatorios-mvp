# Eliminar recordatorios — antes

- Fecha: 2026-10-08
- Tarea: eliminación lógica de recordatorios
- Herramienta: Codex
- Prompt real del usuario, previo a la planificación:

> Actualmente **no hay un endpoint `DELETE` para recordatorios**. Existe `POST /api/v1/reminders/{id}/cancel` (expuesto en la web como `/api/reminders/{id}/cancel`), que solo cancela recordatorios aún programados; el registro permanece y aparece en **Cancelados**. Los disparados tampoco se pueden eliminar desde la API actual.
>
> vamos a crear esta opcion

El usuario eligió ocultar el registro conservando el historial interno, permitir la eliminación de programados, disparados y cancelados, y ocultar también el aviso asociado. No se redactó contenido.
