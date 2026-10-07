# Contrato v1 del emisor WhatsApp

- Estado: aprobado para implementación del MVP.
- Dueño: servicio whatsapp/.
- Consumidor: worker del backend Python.
- Transporte: HTTPS público de Render Free con autenticación Bearer.

## Salud

GET /healthz devuelve 200 cuando el proceso HTTP responde. No comprueba la
sesión de WhatsApp ni accede a PostgreSQL y se usa para mantener activo el
servicio durante la prueba.

GET /readyz devuelve 200 sólo si PostgreSQL responde, el almacén cifrado de
claves está disponible y Baileys está conectado. En otro caso devuelve 503.
Ninguna de estas rutas entrega credenciales, números o mensajes.

## Envío

```http
POST /v1/messages
Authorization: Bearer <service-token>
Idempotency-Key: <uuid>
Content-Type: application/json
```

```json
{
  "phone": "+525512345678",
  "message": "Recordatorio: pagar la tarjeta"
}
```

- phone debe estar en formato E.164, con signo + y entre 8 y 15 dígitos.
- message debe tener entre 1 y 500 caracteres Unicode.
- La clave de idempotencia es un UUID estable del intento lógico. Repetirla
  con el mismo cuerpo devuelve el resultado aceptado que ya se conoce;
  repetirla con otro cuerpo devuelve 409.
- El servicio registra la clave y la huella del cuerpo antes de iniciar el
  envío. Si se interrumpe durante el envío, registra o recupera el resultado
  como unknown y no lo envía de nuevo automáticamente.
- No hay reintentos internos de Baileys en este endpoint.

Respuesta cuando Baileys acepta la llamada:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "status": "accepted",
  "messageId": "provider-id"
}
```

accepted no significa entregado ni leído.

## Errores

| HTTP | code | Significado | Reintento automático |
|---|---|---|---|
| 400 | invalid_request | Teléfono, mensaje o clave inválidos | No |
| 401 | unauthorized | Bearer ausente o inválido | No |
| 409 | idempotency_conflict | Misma clave con otro cuerpo | No |
| 409 | outcome_unknown | Hubo o pudo haber envío sin resultado confirmado | No |
| 429 | rate_limited | Límite aplicado antes de iniciar el envío | Sí, después del plazo indicado |
| 503 | unavailable | Sesión o base no disponible antes de iniciar el envío | Sí |
| 502 | outcome_unknown | El transporte falló después de iniciar el envío | No |

Los errores devuelven application/problem+json con code, title y status.
El backend trata cualquier timeout de red como unknown. Nunca reintenta
automáticamente un unknown y conserva la notificación interna.

## Operación y secretos

- WHATSAPP_API_URL contiene sólo la URL base HTTPS que Render asigna.
- WHATSAPP_SERVICE_TOKEN vive en el worker y en whatsapp/ como secreto de
  entorno. Nunca llega a web/ ni se escribe en logs.
- BAILEYS_ENCRYPTION_KEY vive sólo en whatsapp/ y protege las credenciales y
  claves Signal antes de escribir en Neon.
- La vinculación inicial se hace con una herramienta local que muestra un QR
  únicamente en el terminal del operador. Se detiene antes de arrancar Render.
- Ninguna prueba automatizada envía mensajes reales.
