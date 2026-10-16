# API de suscripciones (HE-08)

Contrato del backend para el frontend. Todas las rutas llevan el prefijo `/api` y requieren `Authorization: Bearer <accessToken>` (el `accessToken` de `POST /api/auth/login`).

## Formato de errores

Se usa el formato estándar de Nest. Los errores de negocio agregan un campo `codigo` estable: el frontend debe decidir por `codigo`, no por el texto de `message`.

```json
{ "statusCode": 403, "error": "Forbidden", "message": "Tu plan venció. Renueva para editar.", "codigo": "PLAN_VENCIDO" }
```

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 401 | — | Falta el token o no es válido (`"Token no proporcionado"` / `"Token inválido o expirado"`). |
| 403 | `PLAN_VENCIDO` | Cualquier escritura (`POST`/`PUT`/`PATCH`/`DELETE`) en un endpoint protegido con el plan vencido. |
| 404 | `SIN_SUSCRIPCION` | Se intenta renovar sin haber comprado nunca un plan. |
| 409 | `PLAN_VIGENTE_CONFIRMAR` | Se intenta renovar un plan con más de 3 días de vigencia sin confirmar. |
| 400 | `RENOVACION_FALLIDA` | No se pudo generar el link de pago (Wompi o BD no disponibles). |
| 404 | `RENOVACION_NO_ENCONTRADA` | La referencia de renovación no existe o es de otro negocio. |
| 429 | — | Se superó el límite global de 10 peticiones por minuto. |

---

## `GET /api/subscriptions/status` — HU-8.5 / HU-8.4

Devuelve el estado de acceso del negocio del usuario autenticado. **Siempre responde**, aun con el plan vencido. Consultarlo al cargar el dashboard y después de un pago.

### 200 OK
```json
{
  "estado": "POR_VENCER",
  "suscripcionId": "8f0c6a3e-2d1b-4f5a-9c7e-1a2b3c4d5e6f",
  "plan": { "id": "0b9d2f4e-7a6c-4e1d-8b3a-5c6d7e8f9a0b", "nombre": "Pro", "precio": 50000 },
  "fechaFin": "2026-10-15T14:30:00.000Z",
  "diasRestantes": 2,
  "puedeEditar": true,
  "alerta": { "tipo": "POR_VENCER", "mensaje": "Tu plan vence en 2 días. Renuévalo aquí." }
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `estado` | `"ACTIVO" \| "POR_VENCER" \| "VENCIDO" \| "SIN_PLAN"` | Estado de acceso calculado en el momento de la consulta. |
| `suscripcionId` | `string \| null` | `null` con `SIN_PLAN`. |
| `plan` | `{ id, nombre, precio } \| null` | `precio` en COP. `null` con `SIN_PLAN`. |
| `fechaFin` | `string (ISO 8601, UTC) \| null` | Fecha de vencimiento. |
| `diasRestantes` | `number \| null` | Días hasta `fechaFin`, redondeado hacia arriba; `0` si ya venció. |
| `puedeEditar` | `boolean` | `false` solo con `VENCIDO`: el dashboard queda en solo lectura. |
| `alerta` | `{ tipo, mensaje } \| null` | Banner a mostrar; `null` con `ACTIVO` y `SIN_PLAN`. |

### Valores de `estado`

| `estado` | Regla | `puedeEditar` | `alerta` |
|---|---|---|---|
| `ACTIVO` | Faltan más de 3 días para `fechaFin`. | `true` | `null` |
| `POR_VENCER` | Faltan 3 días o menos. | `true` | `{ "tipo": "POR_VENCER", "mensaje": "Tu plan vence en N días. Renuévalo aquí." }` |
| `VENCIDO` | `fechaFin` ya pasó. | `false` | `{ "tipo": "VENCIDO", "mensaje": "Tu plan venció y el servicio está restringido. Renuévalo para reactivarlo." }` |
| `SIN_PLAN` | Aún no tiene negocio, o no ha comprado un plan (incluye pagos pendientes). | `true` | `null` |

Ejemplos de otros estados:

```json
{ "estado": "VENCIDO", "suscripcionId": "8f0c…", "plan": { "id": "0b9d…", "nombre": "Pro", "precio": 50000 },
  "fechaFin": "2026-09-20T14:30:00.000Z", "diasRestantes": 0, "puedeEditar": false,
  "alerta": { "tipo": "VENCIDO", "mensaje": "Tu plan venció y el servicio está restringido. Renuévalo para reactivarlo." } }
```
```json
{ "estado": "SIN_PLAN", "suscripcionId": null, "plan": null, "fechaFin": null,
  "diasRestantes": null, "puedeEditar": true, "alerta": null }
```

### Errores
- `401`: falta el token o no es válido.

---

## Restricción de escritura con plan vencido — HU-8.5 criterio 2

Los endpoints de edición del dashboard responden `403` con `codigo: "PLAN_VENCIDO"` cuando el plan está vencido. Las lecturas (`GET`) siguen funcionando.

```json
{ "statusCode": 403, "error": "Forbidden", "message": "Tu plan venció. Renueva para editar.", "codigo": "PLAN_VENCIDO" }
```

| Endpoint | Protegido | Estado |
|---|---|---|
| `PATCH /api/agent/config` | Sí | Pendiente de aplicar por el dueño del módulo `agent`. |
| `POST /api/whatsapp/connections` | Sí | Pendiente de aplicar por el dueño del módulo `whatsapp`. |
| `/api/auth/*`, `/api/business`, `/api/payments/*`, `/api/subscriptions/*` | No | Deben seguir disponibles para iniciar sesión, completar el onboarding y renovar. |

Con `SIN_PLAN` no se bloquea nada, para no interrumpir el onboarding (registro → negocio → plan).

---

## `POST /api/subscriptions/renewal` — HU-8.3

Inicia la renovación manual del **mismo plan** de la suscripción vigente (cambiar de plan es HU-8). Genera un link de pago de Wompi. La vigencia **no** cambia aquí: se extiende cuando Wompi confirma el pago.

### Body
```json
{ "confirmarRenovacionAnticipada": false }
```
| Campo | Tipo | Descripción |
|---|---|---|
| `confirmarRenovacionAnticipada` | `boolean`, opcional (por defecto `false`) | Enviar `true` después de que el usuario confirme renovar un plan que aún tiene más de 3 días de vigencia. |

### 201 Created
```json
{
  "referencia": "test_AbC123",
  "monto": 50000,
  "moneda": "COP",
  "paymentUrl": "https://checkout.wompi.co/l/test_AbC123"
}
```
Redirigir al usuario a `paymentUrl` y guardar la `referencia` para consultar el resultado. La `referencia` es el id del link de pago de Wompi (en producción no lleva el prefijo `test_`); tratarla como un texto opaco.

### Errores
**409 — plan aún vigente (más de 3 días)**: preguntar al usuario y reenviar con `"confirmarRenovacionAnticipada": true`.
```json
{ "statusCode": 409, "error": "Conflict", "codigo": "PLAN_VIGENTE_CONFIRMAR",
  "message": "Tu plan aún está vigente hasta 2026-10-15. ¿Deseas renovarlo de todas formas?",
  "fechaFin": "2026-10-15T14:30:00.000Z" }
```
**404 — nunca ha comprado un plan**: llevar al flujo de compra (HU-8).
```json
{ "statusCode": 404, "error": "Not Found", "codigo": "SIN_SUSCRIPCION", "message": "No tienes un plan para renovar" }
```
**400 — no se pudo generar el link de pago**:
```json
{ "statusCode": 400, "error": "Bad Request", "codigo": "RENOVACION_FALLIDA", "message": "No pudimos iniciar la renovación. Intenta nuevamente." }
```

Con el plan por vencer (3 días o menos) o vencido no se pide confirmación: responde `201` directamente.

---

## `GET /api/subscriptions/renewal/{referencia}` — HU-8.3

Estado del pago de una renovación iniciada por el mismo negocio.

### 200 OK
```json
{ "referencia": "test_AbC123", "estado": "APROBADO",
  "fechaFin": "2026-11-15T14:30:00.000Z", "mensaje": "Plan renovado correctamente." }
```
| `estado` | `fechaFin` | `mensaje` |
|---|---|---|
| `PENDIENTE` | `null` | `Tu pago está siendo procesado. Te notificaremos cuando se confirme.` |
| `APROBADO` | nueva fecha de vencimiento (la anterior + 1 mes si aún no vencía; hoy + 1 mes si ya venció) | `Plan renovado correctamente.` |
| `RECHAZADO` | `null` | `No pudimos procesar la renovación. Intenta nuevamente.` |

### Errores
**404** — la referencia no existe o pertenece a otro negocio:
```json
{ "statusCode": 404, "error": "Not Found", "codigo": "RENOVACION_NO_ENCONTRADA", "message": "No encontramos esa renovación" }
```

---

## Alertas de vencimiento — HU-8.4

**No hay endpoints nuevos.** Un job interno corre **todos los días a las 8:00 a. m. (hora de Colombia)** y:

| Caso | Qué hace el backend | Qué ve el usuario |
|---|---|---|
| Faltan 3 días o menos (criterio 1) | Envía un correo: "Tu plan vence en 3 días. Renuévalo aquí." | En el dashboard, `alerta` de `GET /api/subscriptions/status` con `tipo: "POR_VENCER"` |
| Se renovó antes de la alerta (criterio 2) | No envía nada: la nueva `fechaFin` ya no está a 3 días | `alerta: null` |
| Venció sin renovar (criterio 3) | Marca la suscripción como vencida y envía un correo de restricción | `estado: "VENCIDO"`, `puedeEditar: false`, `alerta.tipo: "VENCIDO"` |

Para el frontend no cambia nada: el banner y la restricción siguen saliendo de `GET /api/subscriptions/status`, que ya refleja el vencimiento aunque el job todavía no haya corrido.

> Mientras el equipo no elija proveedor de correo, los correos **no se envían**: se registran en el log del backend (`EMAIL_PROVIDER=log`).

### Variables de entorno (backend)
| Variable | Valor por defecto | Uso |
|---|---|---|
| `EMAIL_PROVIDER` | `log` | Proveedor de correo. Hoy solo existe `log`. |
| `VENCIMIENTOS_JOB_ENABLED` | activado | Con `false` el job no hace nada (útil en desarrollo local). |
| `WOMPI_REDIRECT_URL` | placeholder de HU-8.1 | Página del frontend a la que Wompi redirige tras pagar una compra o una renovación. |

## Guía de integración (frontend)

1. Al cargar el dashboard, llamar a `GET /api/subscriptions/status` y guardar la respuesta en un estado global. No repetir la llamada en cada navegación, por el límite de 10 peticiones por minuto.
2. Si `puedeEditar` es `false`, deshabilitar los formularios y mostrar el aviso de restricción con un botón **Renovar**.
3. Si `alerta` no es `null`, mostrar un banner con `alerta.mensaje` y un botón **Renovar**.
4. Manejar `403` con `codigo === "PLAN_VENCIDO"` en un único interceptor o `fetch` wrapper: recargar `/status` y mostrar el aviso de restricción.
5. Después de un pago aprobado, volver a consultar `/status`: el acceso se restablece solo, sin ninguna otra acción.

### Flujo de renovación (botón **Renovar**)
1. `POST /api/subscriptions/renewal` con `{}`.
2. Si responde `409` con `codigo === "PLAN_VIGENTE_CONFIRMAR"`, mostrar `message` con **Continuar** / **Cancelar**. Con **Continuar**, reenviar con `{ "confirmarRenovacionAnticipada": true }`.
3. Con el `201`, guardar `referencia` (p. ej. en `sessionStorage`) y redirigir a `paymentUrl`.
4. Al volver del pago, consultar `GET /api/subscriptions/renewal/{referencia}` **cada 10 s o más** (por el límite de 10 peticiones por minuto) hasta obtener `APROBADO` o `RECHAZADO`.
5. Con `APROBADO`, mostrar `mensaje` y recargar `/status`. Con `RECHAZADO`, mostrar `mensaje` y ofrecer reintentar.
