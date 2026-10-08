# Diagnóstico del fallo de CI

Fecha: 2026-10-08. Referencia: `feature/e2e-token-lifetime`.
Herramienta: Codex. Sin redacciones.

Las ejecuciones de `main` y `develop` fallaron en pruebas distintas. `main` conservaba la aserción visual anterior al PR #33 porque el PR #34 publicó `develop` antes de ese arreglo. En `develop`, WebKit móvil encontró «Calculando horario…» cuando esperaba Madrid. El registro mostró muchas renovaciones de sesión y respuestas 429. El entorno E2E configuraba tokens de 35 segundos, con renovación anticipada 30 segundos antes; las pruebas visuales compartían una cookie creada al inicio de toda la suite.

Se descartó registrar una cuenta por prueba porque el límite de registros por IP produjo respuestas 429. Se amplió únicamente la vida del token E2E a 120 segundos y se mantuvo la prueba de renovación dentro de su ventana anticipada.
