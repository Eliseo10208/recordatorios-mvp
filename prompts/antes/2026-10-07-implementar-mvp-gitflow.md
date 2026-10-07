# Implementación del MVP con GitFlow — antes

- Fecha: 7 de octubre de 2026.
- Tarea: implementar-mvp-gitflow.
- Herramienta: Codex.
- Redacciones: ninguna.

## Prompt real del usuario

PLEASE IMPLEMENT THIS PLAN:
# Implementación del MVP con GitFlow

## Resumen

El repositorio todavía contiene documentación y no tiene remoto. Crearemos el repositorio público **Eliseo10208/recordatorios-mvp** y trabajaremos con main para versiones desplegadas, develop para integración, ramas feature/* para cada entrega y release/* para publicar. El orden será: **WhatsApp funcional → URL de Render → backend y worker → frontend y Web Push → MVP integrado**.

## Entregas

1. **Preparar GitFlow y Neon.** Revisar los cambios locales y los registros de prompts para evitar publicar secretos o datos personales; crear el remoto, guardar la documentación inicial y abrir develop. Configurar CI para cada PR. Crear el proyecto Neon y un armazón mínimo de Alembic para migraciones; esto permite construir WhatsApp antes de desarrollar las funciones de FastAPI.

2. **WhatsApp primero, en feature/whatsapp.** Implementar whatsapp/ en TypeScript con una sola sesión Baileys. Guardar credenciales y claves Signal cifradas en tablas propias de Neon; añadir una tabla para reconocer solicitudes repetidas. Ofrecer GET /healthz, GET /readyz y POST /v1/messages. Este último exige Bearer e Idempotency-Key, recibe { phone, message } y responde accepted sólo cuando Baileys acepta el envío. Un resultado ambiguo queda unknown y no se reenvía automáticamente. Baileys recomienda una implementación de estado de autenticación respaldada por base de datos que persista también las claves Signal. [Documentación de Baileys](https://github.com/WhiskeySockets/docs/blob/main/authentication/session-management.mdx)

3. **Vincular y desplegar WhatsApp.** Vincular tu cuenta mediante un QR mostrado sólo en un terminal local; detener ese proceso antes de iniciar Render para evitar dos escritores de la misma sesión. Probar la restauración desde Neon, integrar la rama en develop y publicar release/0.1.0 en main. Desplegar whatsapp/ como Web Service Free, comprobar salud y conexión y realizar **un envío controlado** al número que indiques. Registrar la URL HTTPS que Render asigne; el dominio vendrá de Render y la ruta /v1/messages será nuestra. [Render Web Services](https://render.com/docs/web-services)

4. **Backend y worker.** Extender Alembic con usuarios, sesiones, recordatorios, notificaciones, destinos y ledger. Implementar FastAPI según las rutas de la especificación, incluido número activo único por cuenta y ajuste de horarios. El worker reclamará vencimientos en PostgreSQL, creará primero el aviso interno y llamará al adaptador WhatsApp usando la URL de Render configurada en WHATSAPP_API_URL. Desplegar API y worker como servicios Render separados.

5. **Frontend e integración.** Implementar Next.js, Auth.js, formularios, bandeja y Web Push; desplegar web/ en Vercel. Para respetar tu elección de guardar la sesión en Neon, Auth.js usará su estrategia JWT con **sólo una referencia opaca en la cookie**; los tokens de FastAPI estarán cifrados en una tabla de sesiones web en Neon. Esta adaptación es necesaria porque Auth.js exige estrategia JWT para el proveedor Credentials. [Referencia de Auth.js](https://authjs.dev/reference/core/errors)

## Verificación y operación

- Cada feature entra a develop mediante PR con pruebas y revisión independiente. Las releases pasan de develop a main, se etiquetan y se integran de vuelta en develop; los despliegues permanentes siguen main.
- WhatsApp se verifica con pruebas del contrato, cifrado, persistencia y restauración de claves, duplicados, desconexión, errores y timeout. CI usa simulaciones; el envío real queda limitado a la prueba controlada autorizada.
- El backend se prueba con PostgreSQL real, dos workers concurrentes, reinicios, cambios de número, zonas horarias y fallos independientes de Push y WhatsApp. Playwright cubre el recorrido completo.
- GitHub Actions consultará /healthz cada cinco minutos durante la semana de prueba, primero en WhatsApp y después en los tres servicios. Se vigilarán consumo, atrasos y errores. Los workflows programados pueden retrasarse u omitirse, así que esto **no garantiza disponibilidad ni entrega en 60 segundos**. [GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Render Free](https://render.com/docs/free)
- El rollback desactiva el canal WhatsApp y vuelve a la release anterior sin borrar la sesión ni el ledger.

## Supuestos fijados

El repositorio será público y personal; se usarán los planes gratuitos de Render, Neon y Vercel para una prueba de una semana. Ya autorizaste vincular tu cuenta emisora y hacer una prueba controlada. La contraseña de Neon, las claves de cifrado y el token entre servicios se configurarán como secretos de sus respectivos entornos y nunca se incluirán en Git. El registro de trabajo continuará desde el inicio declarado del **7 de octubre a las 13:00**, sin inventar duraciones anteriores.
