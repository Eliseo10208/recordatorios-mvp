# Implementación del selector de zona horaria

Fecha: 2026-10-08. Referencia: `feature/web-pixel-perfect`.
Herramienta: Codex. Sin redacciones.

No hubo otro prompt del usuario durante la implementación. Se continuó con el registrado en `prompts/antes/2026-10-08-selector-zona-horaria.md`.

El formulario anterior detectaba la zona del dispositivo, pero permitía escribir cualquier cadena. Se sustituyó por un selector nativo de zonas con nombres legibles y selección inicial según el dispositivo. La API sigue recibiendo la zona IANA correspondiente.
