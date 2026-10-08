# Tercer corte TDD: avisos por WhatsApp — durante

No se enviaron prompts adicionales a modelos ni a subagentes. La implementación continuó en el mismo hilo a partir del prompt de `antes/2026-10-07-whatsapp-tdd.md`.

Registro del ciclo observado:

1. Pruebas HTTP de consentimiento y opt-in: 404 esperado antes de crear rutas.
2. Pruebas PostgreSQL de despacho: importación fallida esperada antes de crear el módulo.
3. Migración, servicios, rutas y worker; pruebas verdes con transporte HTTP simulado.
4. Web, BFF y Playwright; la primera ejecución detectó contraste insuficiente y se corrigió el color.
5. Regresión detectó un número fijo reutilizado en datos sintéticos; se cambió a número único por ejecución.

No se usaron IA, RAG ni agentes en el runtime del producto.
