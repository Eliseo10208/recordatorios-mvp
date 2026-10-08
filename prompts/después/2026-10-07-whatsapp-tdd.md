# Tercer corte TDD: avisos por WhatsApp — después

No se utilizó un prompt adicional de revisión por IA. La revisión independiente humana sigue pendiente y no se afirma que el cambio esté aprobado.

Comprobaciones completadas: 33 pruebas API, PostgreSQL real para concurrencia, leases, reintentos y cuota; 4 pruebas web; 21 pruebas WhatsApp incluidas las de persistencia; build web y WhatsApp, lint, formato, tipos, OpenAPI/cliente estable, migración desde base vacía, `alembic check`, límite de 500 líneas y Playwright para auth, recordatorios y WhatsApp. El recorrido WhatsApp usó número sintético y dispatcher externo desactivado.

Pendiente: una prueba de envío real después de que el usuario configure el token en el entorno local y registre un número que controla. No se desplegó API ni worker.
