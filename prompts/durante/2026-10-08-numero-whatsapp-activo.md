# Corrección de destino activo de WhatsApp

Fecha: 2026-10-08. Referencia: `feature/web-pixel-perfect`.
Herramienta: Codex. Sin redacciones.

Se continuó con el pedido registrado en `prompts/antes/2026-10-08-numero-whatsapp-activo.md`.

Prompt adicional del usuario: "fallo un test". Se revisó la ejecución de CI del PR #32 y se corrigió la aserción visual de WebKit que dependía de un texto de ayuda variable.

La API anterior aceptaba reemplazar directamente el número activo; una prueba HTTP nueva reprodujo ese 200 cuando se esperaba 409. Se cambió la API para exigir desactivar primero el número y se ocultó el formulario mientras el destino esté activo. Se actualizaron la especificación y la guía de uso.
