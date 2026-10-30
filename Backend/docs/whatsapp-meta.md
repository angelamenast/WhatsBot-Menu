# WhatsApp con la Cloud API de Meta

El módulo `whatsapp` recibe mensajes por el webhook de Meta, los procesa con el flujo del bot
(deduplicar → conversación → agente → respuesta) y responde por la Graph API. Solo se usa el
**entorno de pruebas de Meta**: no hay producción con WhatsApp.

## Flujo

```
Cliente ──WhatsApp──▶ Meta ──POST /api/whatsapp/webhook──▶ MetaSignatureGuard ──▶ MetaWebhookController
                                                                                       │ 200 inmediato
                                                                                       ▼ (segundo plano, sin colas)
                                                      parseMetaWebhook ─▶ HandleIncomingMessageUseCase
                                                                            │ 1. dedupe por id del mensaje (wamid)
                                                                            │ 2. conexión por phone_number_id
                                                                            │ 3. conversación (cierre por inactividad de 4 h)
                                                                            │ 4. guarda el mensaje, comprueba el plan
                                                                            │ 5. AGENT_DISPATCH_PORT → texto o null
                                                                            ▼
                                                                  SendMessageUseCase ─▶ MetaMessagingAdapter
                                                                                         POST /{version}/{phone_number_id}/messages
```

- **Un solo webhook** (`/api/whatsapp/webhook`) trae mensajes entrantes y estados de entrega
  (`sent`, `delivered`, `read`, `failed`). No existe un endpoint aparte de status-callback.
- **El `200` se responde antes de procesar**, para no atar el ack a la latencia del agente/LLM. Los
  errores del procesamiento se registran y nunca se propagan. Consecuencia: si el proceso muere
  después del ack, ese mensaje se pierde (Meta no reintenta porque ya recibió el 200).
- **Idempotencia**: `mensajes.id_mensaje_proveedor` (el `wamid`) es UNIQUE. Si Meta reintenta un
  webhook, el `existsByProviderMessageId` lo corta; si dos reintentos llegan a la vez, el UNIQUE hace
  fallar el segundo `save` **antes** de despachar al agente, así que nunca hay doble respuesta.
- **Estados de entrega**: `sent`, `delivered` y `read` quedan como `enviado`; `failed` como `fallido`.
  Un `sent` tardío nunca pisa un `failed`. No hay columna para el código de error: `code` y `message`
  del fallo solo se registran en el log.
- **Números**: se guardan y comparan solo con dígitos (`normalizePhoneNumber`: sin `+`, espacios ni
  prefijo `whatsapp:`), tal como los entrega Meta (`wa_id`).
- Solo se procesan mensajes de **texto**. Imágenes, audios, etc. se ignoran con un `warn` que
  menciona únicamente el tipo.

## Variables de entorno

Con `MESSAGING_PROVIDER=meta` o `PROVISIONING_PROVIDER=meta` las tres primeras son obligatorias: si
falta alguna el backend **no arranca** y el error nombra la variable. Nunca se registran sus valores.

| Variable | Obligatoria con `meta` | Descripción |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Sí | Token de acceso de la Graph API. El temporal del panel de Meta dura ~24 h; para algo estable, un token de usuario del sistema. |
| `WHATSAPP_APP_SECRET` | Sí | App Secret de la app de Meta. Valida la firma `X-Hub-Signature-256` del POST. |
| `WHATSAPP_VERIFY_TOKEN` | Sí | Cadena que tú eliges; Meta la envía en la verificación (GET) del webhook. |
| `WHATSAPP_API_VERSION` | No (`v25.0`) | Versión de la Graph API, formato `vNN.N`. |
| `MESSAGING_PROVIDER` | No (`fake`) | `fake` \| `meta`. |
| `PROVISIONING_PROVIDER` | No (`fake`) | `fake` \| `meta`. |

El webhook **falla cerrado**: sin `WHATSAPP_APP_SECRET` rechaza todo POST con 401 y sin
`WHATSAPP_VERIFY_TOKEN` rechaza todo GET con 403, también con los proveedores en `fake`. En local
hay que definirlos para probar el webhook.

## Registrar el webhook

1. En el panel de la app de Meta (**WhatsApp → Configuración de la API**) anota el *Phone number ID*
   del número de prueba y el *WhatsApp Business Account ID*.
2. Completa `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` (Configuración de la app → Básica) y
   `WHATSAPP_VERIFY_TOKEN` en tu `.env`, y pon `MESSAGING_PROVIDER=meta` y `PROVISIONING_PROVIDER=meta`.
3. Arranca el backend y expónlo con un túnel HTTPS (por ejemplo `ngrok http 3000`).
4. En **WhatsApp → Configuración → Webhook** pulsa *Editar*:
   - URL de devolución de llamada: `https://<tu-túnel>/api/whatsapp/webhook`
   - Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN`
   - Meta hace un `GET` con `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`; el backend
     devuelve el challenge en texto plano si el token coincide, o 403.
5. Suscribe el campo **`messages`**.
6. Vincula el número al negocio (autenticado como el dueño del negocio):

   ```http
   POST /api/whatsapp/connections
   { "phoneNumberId": "<Phone number ID>", "wabaId": "<WhatsApp Business Account ID>" }
   ```

   El backend consulta `GET /{version}/{phoneNumberId}?fields=display_phone_number,verified_name`,
   y guarda la conexión como `CONNECTED` con el número visible. Responde `201`; si Meta no valida el
   número, `200` con `FAILED`; si el número ya está vinculado a otro negocio, `409`.
7. Escribe desde uno de los teléfonos verificados al número de prueba.

## Limitaciones del modo de prueba

- **Un número de prueba y hasta 5 teléfonos destinatarios verificados**: a un teléfono que no esté
  en esa lista no se le puede enviar. Como `phone_number_id` y el número visible son únicos, **un
  solo negocio** puede vincular el número de prueba a la vez.
- **Ventana de 24 h**: solo se puede enviar texto libre dentro de las 24 h posteriores al último
  mensaje del cliente. Pasado ese plazo Meta rechaza el envío (code `131047`) y solo admitiría
  plantillas, que están fuera de alcance. Afecta a los avisos de `orders` (pedido confirmado o
  cancelado) enviados tarde: el mensaje queda `fallido` y se registra un error tipado
  (`MessagingWindowClosedError`). El estado `ACTIVE` de una conversación **no** garantiza que la
  ventana siga abierta: el cierre por inactividad es perezoso (ocurre al llegar el siguiente mensaje).
- El token temporal del panel de pruebas caduca (~24 h): si los envíos empiezan a fallar con
  `WhatsappProviderAuthError` (code `190`), genera uno nuevo.
- Sin Embedded Signup ni verificación de negocio: la vinculación es manual, con los IDs del panel.
- Un envío sin respuesta en 10 s se cancela (sin reintentos) y el mensaje queda `fallido`.
- Cuerpo máximo de 4096 caracteres; un cuerpo vacío o mayor se rechaza antes de llamar a Meta.

## Errores de la Graph API

Los errores `{ error: { message, code, fbtrace_id } }` se traducen a errores de dominio. En el log
solo van `code`, `message` y `fbtrace_id`; nunca el token.

| Situación | Error |
|---|---|
| `code 190` (token inválido o vencido) | `WhatsappProviderAuthError` |
| `code 131047` (más de 24 h sin respuesta del cliente) | `MessagingWindowClosedError` |
| Timeout de 10 s | `WhatsappProviderTimeoutError` |
| Cualquier otro | `WhatsappProviderError` (con `providerCode` y `traceId`) |
| Cuerpo vacío o > 4096 caracteres | `InvalidMessageBodyError` |

Los códigos 190 y 131047 están en la
[documentación oficial](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes);
el resto se mapea de forma genérica a propósito.
