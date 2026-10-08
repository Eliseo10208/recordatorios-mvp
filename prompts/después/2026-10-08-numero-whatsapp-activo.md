# Verificación del destino activo de WhatsApp

Fecha: 2026-10-08. Referencia: `feature/web-pixel-perfect`.
Herramienta: Codex. Sin redacciones.

No hubo un prompt adicional del usuario para esta etapa. Se verificó el pedido registrado en `prompts/antes/2026-10-08-numero-whatsapp-activo.md`.

La API rechaza con 409 un número distinto mientras hay uno activo y conserva la programación existente. Tras desactivar, permite registrar otro número. El recorrido de navegador comprueba que el formulario desaparece con un destino activo, vuelve al desactivarlo y que el reemplazo directo por BFF devuelve 409. Pasaron 50 pruebas de API con PostgreSQL local y 18 recorridos E2E, incluidos Chromium y WebKit móvil. La revisión independiente sigue pendiente antes del merge.
