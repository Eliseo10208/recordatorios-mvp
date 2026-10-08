# Configurar correo de cuenta con Resend

La API usa Resend sólo para verificar correos y recuperar contraseñas. Envía
por HTTP desde `api/app/account_email.py`; `web/` no necesita una API key de
Resend. Otro desarrollador puede usar su propia cuenta de Resend sin cambiar
el código, siempre que controle un dominio remitente verificado.

## Instalación o cambio de cuenta de Resend

1. En Resend, añade un dominio o subdominio del que seas propietario y publica
   los registros DNS que muestre el panel. Espera a que la capacidad de **envío**
   aparezca verificada. [Resend exige un dominio verificado](https://resend.com/docs/dashboard/domains/introduction)
   para enviar desde él. Si ese dominio ya pertenece a otro equipo de Resend,
   sigue su [proceso oficial de reclamación](https://resend.com/changelog/domain-claim)
   antes de cambiar el remitente.
2. Crea una API key específica para este despliegue, preferiblemente con permiso
   de envío y restringida al dominio. Resend permite gestionar el nombre,
   permiso y dominio de cada clave desde su
   [panel de API keys](https://resend.com/docs/dashboard/api-keys/introduction).
   Guarda el valor cuando se crea; no lo pongas en Git, Vercel ni logs.
3. En **la API de Render**, configura:

   | Variable | Valor esperado |
   |---|---|
   | `RESEND_API_KEY` | Clave de la cuenta y dominio nuevos. |
   | `RESEND_FROM_EMAIL` | Remitente del dominio verificado, por ejemplo `Recordatorios <no-reply@tu-dominio.example>`. |
   | `WEB_BASE_URL` | Origen HTTPS de la web de esa instalación; en la entrega actual, `https://recordatorios-web-one.vercel.app`. |
   | `ACCOUNT_EMAIL_ENABLED` | `false` hasta terminar migración, permisos y verificación; después `true`. |

4. Antes de habilitar el correo, confirma que la base tenga la migración
   `0005_account_tokens` o posterior. Si el rol `recordatorios_app` ya existía,
   ejecuta `api/scripts/provision_app_role.py` con `MIGRATION_DATABASE_URL` para
   concederle acceso a `account_tokens`; el script no cambia su contraseña.
   Sigue [NEON.md](NEON.md) para migraciones y roles.
5. Despliega API con las variables completas y habilita
   `ACCOUNT_EMAIL_ENABLED=true`. Con una dirección controlada, prueba registro,
   reenvío de verificación y recuperación de contraseña. Es una prueba real de
   correo y se realiza sólo con autorización y un destinatario propio.

El backend guarda únicamente huellas SHA-256 de los tokens: verificación vence
en 24 horas y recuperación en 30 minutos. El enlace utiliza `WEB_BASE_URL` y
el token llega a la web en el fragmento de la URL. La API limita envíos por
dirección, IP y globalmente. Si Resend falla, el registro permanece creado y el
usuario puede pedir otro enlace. La API no registra el token, la dirección ni
la respuesta del proveedor. Un `/readyz=200` de la API no demuestra que el
correo funcione: hay que verificar el evento en una prueba controlada y, si
procede, en el panel de Resend.

Para volver atrás, configura `ACCOUNT_EMAIL_ENABLED=false` en la API y
despliega de nuevo. La tabla `account_tokens` puede permanecer; no ejecutes un
downgrade destructivo. Si cambias la cuenta de Resend, sustituye **juntos**
`RESEND_API_KEY` y `RESEND_FROM_EMAIL`; el remitente debe pertenecer al dominio
verificado en la cuenta que emitió la clave.
