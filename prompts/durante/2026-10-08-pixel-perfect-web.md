# Corrección de espaciado visual

Fecha: 2026-10-08. Referencia: `feature/web-pixel-perfect`.
Herramienta: Codex. Sin redacciones.

No hubo otro prompt del usuario durante la implementación. Se continuó con el prompt registrado en `prompts/antes/2026-10-08-pixel-perfect-web.md`.

El entorno local reprodujo 2 px entre la ayuda de WhatsApp y la etiqueta «Fecha», 1 px entre las etiquetas de fecha/hora y sus campos, y 0 px entre el texto y el contador. Se ajustó el CSS del formulario y se añadió una prueba de geometría que falló antes de la corrección.

El primer CI reveló que otra prueba podía activar WhatsApp en la cuenta compartida y ocultar la ayuda que esta prueba medía. Se fijó sólo la respuesta de configuración en la página de la prueba visual para hacerla determinista.
