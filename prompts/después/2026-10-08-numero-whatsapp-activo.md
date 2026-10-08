# Verificación del destino activo de WhatsApp

Fecha: 2026-10-08. Referencia: `feature/web-pixel-perfect`.
Herramienta: Codex. Sin redacciones.

Se verificaron el pedido registrado en `prompts/antes/2026-10-08-numero-whatsapp-activo.md` y el aviso posterior "fallo un test".

La API rechaza con 409 un número distinto mientras hay uno activo y conserva la programación existente. Tras desactivar, permite registrar otro número. El recorrido de navegador comprueba que el formulario desaparece con un destino activo, vuelve al desactivarlo y que el reemplazo directo por BFF devuelve 409. Pasaron 50 pruebas de API con PostgreSQL local y 18 recorridos E2E locales, incluidos Chromium y WebKit móvil. El primer CI del PR #32 falló en una aserción visual anterior que esperaba un texto de ayuda exacto; el test ahora mide la separación del elemento que precede al campo de fecha, sin depender de dicho texto. La revisión independiente sigue pendiente antes del merge.
