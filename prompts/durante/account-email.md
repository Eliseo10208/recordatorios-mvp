# Implementación del correo de cuenta

Fecha: 2026-10-07. Referencia: `feature/account-email`. Herramienta: Codex.
El prompt no contiene claves, tokens ni direcciones personales; no fue redactado.

## Prompt recibido

PLEASE IMPLEMENT THIS PLAN:
# Correo de cuenta con Resend

## Resumen

Completar la **verificación de correo y la recuperación de contraseña** acordadas para el MVP. FastAPI seguirá siendo la autoridad de identidad; Resend sólo enviará los enlaces. La prueba real usará una cuenta y un buzón de prueba, sin cambiar la contraseña de tu cuenta definitiva.

## Implementación

- Tras la revisión del PR #14, crear `feature/account-email` desde `develop`. Añadir la migración `0005_account_tokens` en Neon: propósito `verify_email` o `reset_password`, huella única del token, caducidad y consumo. Actualizar los permisos de `recordatorios_app` sobre la nueva tabla sin rotar su contraseña ni darle acceso a las tablas de Baileys.
- Añadir en FastAPI los cuatro endpoints ya previstos en la especificación: `POST /verify-email` con `{token}`, `POST /resend-verification` con sesión autenticada, `POST /forgot-password` con `{email}` y `POST /reset-password` con `{token, new_password}`. Las solicitudes de enlace responderán 202; un token inválido, vencido o usado no podrá consumirse.
- Generar tokens aleatorios de 32 bytes, guardar sólo su SHA-256 y fijar caducidades de **24 horas para verificación** y **30 minutos para recuperación**. El restablecimiento cambiará el hash Argon2id, marcará el correo como verificado, consumirá los enlaces pendientes, incrementará `auth_version` y revocará todas las sesiones. Exigirá iniciar sesión de nuevo.
- Enviar el correo después de confirmar la transacción, mediante `httpx` y la API de Resend. Un fallo de envío no deshará el registro; el usuario podrá solicitar otro enlace. La recuperación dará la misma respuesta para correos existentes e inexistentes y limitará solicitudes por correo normalizado e IP. El envío tendrá timeout; cualquier reintento de una misma solicitud usará el mismo payload y `Idempotency-Key`. [OWASP recomienda respuesta y tiempo uniformes, tokens de un solo uso y revocación de sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html); [Resend conserva sus claves de idempotencia durante 24 horas](https://resend.com/changelog/idempotency-keys).
- En Next.js, añadir «Olvidé mi contraseña», solicitud y formulario de nueva contraseña; pantalla de confirmación de correo y botón para reenviar el enlace desde el aviso de correo pendiente. Los enlaces usarán el dominio fijo de Vercel y llevarán el token en el fragmento de URL; la página lo retirará de la barra antes de enviarlo por un BFF explícito. Las mutaciones validarán `Origin` y las páginas del enlace usarán `Referrer-Policy: no-referrer`.

## Configuración y despliegue

- Configurar **sólo en la API de Render** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` como `Recordatorios <no-reply@dominio-validado>` y `WEB_BASE_URL=https://recordatorios-web-one.vercel.app`. Verificar el dominio y el remitente en Resend sin copiar la clave al repositorio, Vercel o los logs.
- Añadir `ACCOUNT_EMAIL_ENABLED`, inicialmente desactivado. Limitar esta prueba a **80 envíos al día** para quedar por debajo de los [100 correos diarios del plan gratuito de Resend](https://resend.com/pricing). Crear un punto de recuperación en Neon, aplicar `0005` una vez, conceder permisos, desplegar API y web desde `main`, y entonces activar el correo.
- Integrar mediante PR revisado a `develop`, publicar `release/0.3.0` en `main` y etiquetar `v0.3.0`. El rollback desactiva el envío y restaura la versión anterior; la tabla aditiva permanece sin ejecutar un downgrade destructivo.

## Verificación y aceptación

- Probar con PostgreSQL 17 y Resend simulado: cuenta inexistente, límites, fallo y timeout del proveedor, token vencido o repetido, dos consumos concurrentes, recuperación de cuenta no verificada y rechazo de todos los JWT y refresh tokens anteriores. Regenerar OpenAPI y el cliente TypeScript; ejecutar CI y Playwright para ambos recorridos.
- Con la cuenta de prueba en producción, comprobar recepción de los dos correos, verificación, restablecimiento, rechazo de la contraseña anterior y acceso con la nueva. La dirección de prueba se introducirá localmente durante la ejecución. Revisar el estado en Resend sin exponer tokens ni direcciones en logs.
- No se incluye Web Push ni el cambio pendiente a sesiones web opacas en Neon; siguen siendo trabajos separados.
