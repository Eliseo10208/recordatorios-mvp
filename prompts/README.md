# Registro de prompts y tiempos

Esta carpeta conserva evidencia del uso de IA durante el desarrollo. Se completará al cerrar cada tarea, con contenido real y sin inventar prompts ni duraciones.

- antes/: prompts usados para analizar requisitos, inspeccionar y planificar.
- durante/: prompts usados para implementar, depurar y ejecutar verificaciones.
- después/: prompts usados para revisar, validar y preparar la entrega.
- tiempos.csv: inicio, fin y duración medida por etapa.
- [tiempos_estimados.csv](tiempos_estimados.csv): aproximación retrospectiva por etapa hasta el despliegue, separada de las mediciones.
- [TIEMPOS_ESTIMADOS.md](TIEMPOS_ESTIMADOS.md): fuentes, cálculo e incertidumbre de esa aproximación.

Para cada tarea, crea un archivo Markdown en la subcarpeta correspondiente, con un nombre que identifique la tarea. Incluye fecha, referencia de la tarea, herramienta y texto exacto del prompt enviado. Si contiene secretos o datos personales, redacta sólo esos fragmentos y deja constancia de la redacción. No copies instrucciones internas de las herramientas ni reconstruyas prompts que no se conservaron.

En tiempos.csv, usa fechas ISO 8601 con zona horaria y minutos reales transcurridos. Registra una fila por etapa y tarea. Si una etapa no ocurrió o no se midió, indícalo en observaciones y deja vacíos sus tiempos y duración. Una estimación solicitada expresamente se registra en el archivo separado y nunca se copia a la columna de duración medida.

## Recuperación de chats (8 de octubre de 2026)

Los archivos `*-chats-recuperados.md` de `antes/`, `durante/` y `después/`
reúnen 87 mensajes del usuario sobre esta prueba recuperados de 10 chats
accesibles de Codex y ChatGPT. Otros 12 mensajes recuperados ya estaban
transcritos en el repositorio y no se repitieron. Cada entrada conserva fecha, chat
de origen y herramienta. Se omitieron envolturas automáticas del cliente y
respuestas breves de confirmación; se redactaron correos, teléfonos y posibles
claves y se normalizaron espacios al final de línea. El listado accesible no
garantiza que abarque todo el historial de la cuenta, y los adjuntos visuales
no se transcribieron.

La actualización documental posterior a la integración de `main` se registró
en `antes/2026-10-08-documentacion-completa.md`. No se atribuyeron prompts
inexistentes a las etapas durante o después.
