# Tercer corte TDD: avisos por WhatsApp — antes

Prompt real recibido del usuario:

> PLEASE IMPLEMENT THIS PLAN:
> # Tercer corte TDD: avisos por WhatsApp
>
> ## Resumen
>
> Completar el flujo **registrar número y consentimiento → activar WhatsApp en un recordatorio → vencer → enviar una copia**. El aviso interno seguirá creándose aunque WhatsApp falle. Este corte se implementará y validará en local y CI; no desplegará la API ni el worker.
>
> ## Datos y API
>
> - Añadir una migración aditiva posterior a `0003_reminders` para destinos WhatsApp e intentos de entrega. Guardar el número E.164 cifrado, una huella HMAC para impedir que esté activo en dos cuentas, sólo los últimos cuatro dígitos para la UI, fecha y versión del consentimiento. Usar una clave de 32 bytes configurada fuera del repositorio y compartida únicamente por API y worker.
> - Implementar `GET`, `PUT` y `DELETE /api/v1/notification-settings/whatsapp`. `PUT` recibirá `{phone, consent: true}`; exigirá `+` y código de país, normalizará separadores habituales y rechazará números que no cumplan E.164. El texto de consentimiento v1 será: «Acepto recibir por WhatsApp recordatorios de esta aplicación en el número indicado. Puedo desactivarlos cuando quiera». `GET` mostrará sólo el número enmascarado; `DELETE` desactivará el canal y eliminará el número cifrado. Limitar los cambios a cinco por hora y usuario.
> - Admitir `send_whatsapp` en creación y edición de recordatorios, inicialmente `false`; activarlo sin destino vigente devolverá 422. Mantener el control de versión existente y añadir al detalle un estado de WhatsApp separado del estado `fired`. Al desactivar el destino, quitar WhatsApp de los recordatorios futuros; al cambiarlo, éstos conservarán su preferencia y usarán el número nuevo. Los intentos pendientes de recordatorios ya vencidos se cancelarán, sin redirigirlos.
>
> ## Despacho seguro
>
> - En la misma transacción que crea el aviso interno, crear como máximo un intento WhatsApp cuando correspondan número y consentimiento vigentes. Después del commit, el worker reclamará intentos con `FOR UPDATE SKIP LOCKED` y lease de 90 segundos, comprobará nuevamente el destino y llamará fuera de la transacción a `${WHATSAPP_API_URL}/v1/messages`. La URL se configurará como `https://recordatorios-whatsapp-kxia.onrender.com`; el Bearer quedará sólo en el worker. Enviar `phone`, `message: "Recordatorio: {mensaje}"` y el UUID estable del intento como `Idempotency-Key`.
> - Registrar `pending`, `sending`, `accepted`, `failed`, `unknown` o `canceled`; `accepted` **no** se mostrará como entregado. Aplicar timeout de conexión de 3 segundos y lectura de 25 segundos. Reintentar únicamente respuestas 429 y 503, con el plazo `Retry-After` cuando exista o demoras de 30 segundos, 1, 2, 4, 8 y 16 minutos, con jitter; después, marcar `failed`. Limitar el despacho global a 20 solicitudes por minuto mediante PostgreSQL.
> - Tratar timeout, error de red ambiguo, 502, resultado `outcome_unknown` y una lease `sending` vencida como `unknown` terminal: no habrá reenvío automático que pueda duplicar un mensaje. La ausencia de configuración WhatsApp deshabilitará ese canal sin detener los avisos internos; una configuración parcial impedirá iniciar el despacho.
>
> ## Web y validación
>
> - Añadir configuración del número y consentimiento, interruptor por recordatorio, número enmascarado y estados de entrega. Usar BFF explícitos con validación de `Origin`; no exponer número completo, Bearer ni refresh token al navegador. Regenerar OpenAPI y el cliente TypeScript.
> - Seguir TDD para validación, aislamiento, número duplicado, cambio y baja, consentimiento, concurrencia, caídas, reintentos seguros y resultados desconocidos. Probar el contrato HTTP con transporte simulado; ejecutar API, web, WhatsApp, Playwright, accesibilidad, migración desde base vacía, `alembic check`, lint, tipos y build. Registrar prompts y tiempos.
> - Hacer **una** prueba manual de envío real desde el entorno local cuando configures `WHATSAPP_SERVICE_TOKEN` fuera del repositorio y registres en la app un número que controlas. Verificar aviso interno y estado `accepted`, sin interpretar esa respuesta como entrega. La prueba real no formará parte de CI.
>
> ## Supuestos y límites
>
> No se verifica la propiedad del número mediante OTP en este corte, conforme a la especificación actual. No se recuperan envíos WhatsApp de recordatorios disparados antes de la migración. Un envío que ya esté en curso al cambiar o desactivar el número puede terminar; el worker impedirá iniciar solicitudes nuevas al destino anterior.

No se enviaron prompts a otros agentes.
