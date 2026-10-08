# Vincular o cambiar el emisor de WhatsApp

Esta guía es para quien **opera el servicio `whatsapp/`**, por ejemplo otro
desarrollador que despliega su propia instalación o sustituye el teléfono
emisor de una instalación existente. Los usuarios de la web sólo registran un
número **receptor** en Dashboard → WhatsApp; no escanean este QR. El código
admite una sola sesión Baileys, identificada como `central-sender`.

## Instalación nueva con el teléfono de otro desarrollador

1. Prepara una base propia en Neon siguiendo [NEON.md](NEON.md), aplica las
   migraciones y crea el rol `whatsapp_sender`. Usa su conexión **directa** en
   `whatsapp/DATABASE_URL`; el host con `-pooler` se rechaza porque el emisor
   mantiene un advisory lock de PostgreSQL.
2. Instala Node.js 24 y pnpm 11.19. Desde la raíz ejecuta
   `pnpm install --frozen-lockfile`. Configura en `whatsapp/.env` los valores de
   `whatsapp/.env.example`: `DATABASE_URL`, `BAILEYS_ENCRYPTION_KEY` (32 bytes
   aleatorios en base64) y `WHATSAPP_SERVICE_TOKEN` (al menos 32 caracteres).
   Ese archivo no se sube a Git. El token debe coincidir con el del worker.
3. Desde `whatsapp/`, ejecuta `pnpm db:check`. En una base nueva debe indicar
   `vinculado=false` y `emisor_activo=false`. Esta comprobación puede crear
   credenciales iniciales sin vincular; no envía mensajes.
4. Con el servicio de Render apagado, ejecuta `pnpm pair` desde `whatsapp/`.
   Escanea **en el teléfono que enviará** el QR mostrado sólo en ese terminal,
   mediante la función de dispositivos vinculados de WhatsApp. Espera a que
   el comando confirme la persistencia de la sesión en Neon y termine.
5. Ejecuta otra vez `pnpm db:check`: debe indicar `vinculado=true`. Cierra el
   proceso local antes de iniciar el emisor en Render; sólo una instancia puede
   mantener el lock. Configura los mismos `DATABASE_URL`,
   `BAILEYS_ENCRYPTION_KEY` y `WHATSAPP_SERVICE_TOKEN` como secretos del servicio
   Render. Comprueba `/readyz=200` después de arrancarlo.
6. Configura en el worker `WHATSAPP_API_URL` y el mismo
   `WHATSAPP_SERVICE_TOKEN`, y en API y worker el mismo `WHATSAPP_PHONE_KEY`.
   Esta última clave protege **destinos de usuarios** y es distinta de
   `BAILEYS_ENCRYPTION_KEY`. [README.md](../../README.md#avisos-por-whatsapp)
   describe el resto del despliegue.

`pnpm pair` siempre carga la sesión `central-sender` de esa base. Si ya estaba
vinculada, intentará restaurarla: ejecutar el comando de nuevo **no cambia**
al teléfono emisor ni muestra necesariamente otro QR.

## Sustituir el emisor de una instalación existente

Esto deja de usar la sesión anterior y requiere una ventana de mantenimiento
aprobada por el responsable de la instalación. El repositorio no tiene un
comando automático de cambio de emisor; la operación siguiente es manual.

1. Detén el worker de envíos y el servicio `whatsapp/`. Los intentos pendientes
   podrían salir del teléfono nuevo al reanudar el worker; revisa su estado y
   decide cómo tratarlos antes de continuar. Crea un punto de recuperación de
   Neon y confirma la base, rama y rol que usarás. Conserva la misma
   `BAILEYS_ENCRYPTION_KEY` durante el cambio.
2. Desde `whatsapp/`, con la conexión directa del rol `whatsapp_sender`, usa
   `pnpm db:check` para comprobar `emisor_activo=false`. Si es `true`, hay otro
   proceso con el lock: no continúes. La antigua persona propietaria puede
   retirar el dispositivo vinculado desde su WhatsApp.
3. Abre **una sola sesión `psql`** con esa misma conexión directa y ejecuta el
   bloque siguiente. El lock transaccional evita borrar la sesión mientras
   otro emisor la usa. Verifica que la transacción termina sin error; no borres
   `whatsapp_send_requests`, `delivery_attempts` ni destinos de usuarios.

   ```sql
   \set ON_ERROR_STOP on
   BEGIN;
   DO $$
   BEGIN
     IF NOT pg_try_advisory_xact_lock(20261007, 1) THEN
       RAISE EXCEPTION 'El emisor sigue activo';
     END IF;
     IF (SELECT count(*) FROM baileys_auth
         WHERE session_id = 'central-sender') <> 1 THEN
       RAISE EXCEPTION 'Se esperaba una sesión central existente';
     END IF;
   END
   $$;
   DELETE FROM baileys_signal_keys WHERE session_id = 'central-sender';
   DELETE FROM baileys_auth WHERE session_id = 'central-sender';
   COMMIT;
   ```

4. Mantén apagado Render y ejecuta `pnpm pair` localmente con la **misma** base,
   rol y clave de cifrado. Ahora debe aparecer un QR nuevo para el teléfono del
   otro desarrollador. Después de vincular, comprueba `vinculado=true` con
   `pnpm db:check`, cierra el terminal local, arranca `whatsapp/` en Render y
   comprueba `/readyz=200`.
5. Reanuda el worker sólo después de revisar los intentos pendientes. Una
   prueba de envío a un destinatario controlado requiere autorización explícita;
   `/readyz` no acredita que el mensaje llegó al teléfono.

Si la nueva vinculación falla, mantén el canal detenido. Recuperar la sesión
anterior exige restaurar **sus credenciales y claves Signal juntas** y conservar
la clave de cifrado. Restaurar toda la rama de Neon puede revertir datos de la
app creados después del punto de recuperación; no lo hagas como rollback
automático. Coordina una recuperación específica con quien administra la base.

Esta operación cambia el **único emisor** para todos los usuarios; no añade
una cuenta emisora por usuario ni permite dos emisores simultáneos. La decisión
de arquitectura está en [ADR-0001](../adr/ADR-0001-whatsapp-centralizado.md).
