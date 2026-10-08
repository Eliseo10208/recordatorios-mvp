# Preparar PostgreSQL en Neon

Neon aloja la base relacional de API, worker y emisor WhatsApp. Cada
desarrollador puede crear su propio proyecto o rama de Neon para una
instalación aislada. Una [rama tiene su propia cadena de conexión](https://neon.com/docs/get-started-with-neon/workflow-primer);
no reutilices la base productiva para pruebas locales.

## Conexiones y roles de este repositorio

| Uso | Variable | Rol | Conexión |
|---|---|---|---|
| Migraciones y provisión | `MIGRATION_DATABASE_URL` | Propietario con permisos DDL | Directa; sólo en el entorno del operador. |
| API y worker | `DATABASE_URL` | `recordatorios_app` | Directa en ambos servicios Render. |
| Emisor `whatsapp/` y `pnpm pair` | `DATABASE_URL` | `whatsapp_sender` | **Directa obligatoria** para el advisory lock. |

La URL directa de Neon no usa el host con sufijo `-pooler`. En este proyecto
`whatsapp/src/config.ts` rechaza ese host para el emisor. Las cadenas contienen
contraseñas: consérvalas en el gestor de secretos y nunca en documentación,
capturas, commits, logs ni variables del navegador. Neon explica la diferencia
entre conexiones directas y agrupadas en su
[guía de pooling](https://neon.com/docs/connect/connection-pooling).

## Instalación nueva

1. Crea un proyecto o rama de Neon y selecciona la base y el rol propietario.
   Obtén su cadena **directa** para `MIGRATION_DATABASE_URL`. Verifica el host
   y nombre de base sin imprimir la contraseña. Crea un punto de recuperación
   antes de operar sobre una rama con datos; Neon documenta
   [backups y restauración](https://neon.com/docs/manage/backups).
2. Desde `api/`, con `MIGRATION_DATABASE_URL` en el entorno, ejecuta
   `uv sync --frozen` y `uv run alembic upgrade head`. Confirma que
   `alembic_version` muestra `0006_reminder_soft_delete`, el head documentado
   en [ESQUEMA_IMPLEMENTADO.md](../ESQUEMA_IMPLEMENTADO.md).
3. Para crear el rol `whatsapp_sender`, proporciona una contraseña aleatoria de
   al menos 32 caracteres en `WHATSAPP_DB_PASSWORD` y ejecuta desde `api/`
   `uv run python scripts/provision_whatsapp_role.py`. **Sólo sirve para un rol
   nuevo**: si ya existe, se detiene para no rotar su contraseña.
4. Para `recordatorios_app`, proporciona `APP_DB_PASSWORD` de al menos 32
   caracteres si el rol no existe y ejecuta desde `api/`
   `uv run python scripts/provision_app_role.py`. Si ya existe, el script sólo
   concede permisos faltantes. No tiene acceso a las tablas de Baileys; el
   rol `whatsapp_sender` sólo tiene acceso a sus tres tablas.
5. Genera cadenas directas para ambos roles. Configura la del primero en
   API y worker Render, y la del segundo en `whatsapp/` Render y en el terminal
   local que ejecutará `pnpm pair`. No uses la URL propietaria en runtime.
6. Comprueba `api /readyz`, `worker /readyz` y `whatsapp /readyz` después de
   configurar los demás secretos y vincular el emisor. Desde `whatsapp/`,
   `pnpm db:check` comprueba el rol restringido y el almacén cifrado sin
   mostrar credenciales. Consulta [WHATSAPP_EMISOR.md](WHATSAPP_EMISOR.md) para
   la vinculación.

Las migraciones `0001`–`0006` crean 13 tablas; no crean notas ni Web Push.
Alembic es la fuente de verdad del esquema. No supongas que el head de una base
existente coincide con el código: consulta `alembic_version` antes y después
de cada migración. Ejecuta migraciones **una sola vez** con el rol propietario,
fuera del arranque de Render.

## Cambiar de proyecto o rama de Neon

Un proyecto nuevo no contiene usuarios, recordatorios ni la sesión Baileys de
otro proyecto. Aplica migraciones, roles y secretos desde cero. Si se busca
conservar datos, planifica una migración de datos y claves cifradas por
separado: `BAILEYS_ENCRYPTION_KEY` debe descifrar el almacén del emisor y
`WHATSAPP_PHONE_KEY` debe descifrar los números destino existentes. Cambiar
esas claves sin migrar los datos deja ambos conjuntos ilegibles.

Antes de cambiar una base productiva, crea un punto de recuperación y verifica
la rama de destino. Restaurar una rama completa puede revertir cambios de
usuarios posteriores al punto elegido; la recuperación se decide caso por
caso. Neon ofrece [ramas aisladas](https://neon.com/docs/get-started-with-neon/workflow-primer)
para ensayar migraciones sin escribir en producción.
