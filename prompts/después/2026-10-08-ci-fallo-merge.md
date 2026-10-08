# Verificación del fallo de CI

Fecha: 2026-10-08. Referencia: `feature/e2e-token-lifetime`.
Herramienta: Codex. Sin redacciones.

El cambio afecta sólo al entorno y a la espera de una prueba E2E. La API y la configuración productiva conservan sus tiempos de token. Pasaron 18 recorridos E2E locales, incluidos el de renovación de sesión y WebKit móvil; también pasaron formato, lint y tipos del frontend y Ruff del script modificado. La publicación de este arreglo en `main` requiere integrar primero la rama de corrección y luego una release revisada.
