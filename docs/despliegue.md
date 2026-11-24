# Despliegue: Railway (backend) + Vercel (frontend)

Arquitectura de la demo:

```
WhatsApp ─▶ Meta Cloud API ─▶ Railway  (NestJS, /api)  ◀─ Wompi (webhook de pagos)
                                 │  ▲
                                 ▼  │ HTTPS + Bearer
                            Supabase   Vercel (Astro estático) ◀─ navegador
                                 │
                       Gemini · Resend (correos)
```

Orden recomendado (cada paso necesita la URL del anterior):
**Supabase → Railway (sin dominio de front aún) → Vercel → volver a Railway con la URL de Vercel → Meta → Wompi → Resend → prueba completa.**

---

## 1. Supabase

1. Aplica **todas** las migraciones de `Backend/supabase/migrations` en orden (SQL Editor o `supabase db push`).
   Comprueba en particular `20261018140000_create_token_quota_functions.sql` (cuota de tokens) y
   `20261029130000_migrate_whatsapp_to_meta_cloud_api.sql`.
2. Carga los planes si la tabla `planes` está vacía: desde `Backend`, `node --env-file=.env seed-planes.js`.
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://<tu-app>.vercel.app`
   - *Redirect URLs*: agrega `https://<tu-app>.vercel.app/auth/callback` (deja también la de localhost).
4. Anota `SUPABASE_URL` y la `service_role` key (Settings → API). La service_role **solo** va en Railway.

## 2. Railway (backend)

1. *New Project → Deploy from GitHub repo* → elige el repositorio y la rama a desplegar.
2. En el servicio, **Settings**:
   - *Root Directory*: `Backend`
   - *Config file path*: `/Backend/railway.json` (Railway no lo busca dentro del Root Directory por sí solo).
   - *Networking → Generate Domain*: obtienes `https://<backend>.up.railway.app`.
3. **Variables** (pestaña *Variables* → *Raw Editor*). Valores de la demo:

```env
# Core
FRONTEND_URL=https://<tu-app>.vercel.app
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secreto>

# Wompi (sandbox)
WOMPI_BASE_URL=https://sandbox.wompi.co/v1
WOMPI_PRIVATE_KEY=<prv_test_...>
WOMPI_EVENTS_SECRET=<test_events_...>
WOMPI_REDIRECT_URL=https://<tu-app>.vercel.app/billing

# WhatsApp (Meta Cloud API)
MESSAGING_PROVIDER=meta
PROVISIONING_PROVIDER=meta
WHATSAPP_API_VERSION=v25.0
WHATSAPP_ACCESS_TOKEN=<token de usuario del sistema>
WHATSAPP_APP_SECRET=<app secret>
WHATSAPP_VERIFY_TOKEN=<cadena aleatoria larga que tú eliges>

# Flujo bot → agente → pedido
PLAN_STATUS_PROVIDER=subscriptions
AGENT_DISPATCH_PROVIDER=agent
ORDER_PROVIDER=orders
CATALOG_PROVIDER=supabase
USAGE_QUOTA_PROVIDER=supabase

# LLM
LLM_PROVIDER=gemini
GEMINI_API_KEY=<clave de Google AI Studio>
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
GEMINI_THINKING_LEVEL=low
GEMINI_TIMEOUT_MS=5000
GEMINI_MAX_OUTPUT_TOKENS=1024

# Correos de vencimiento
EMAIL_PROVIDER=resend
RESEND_API_KEY=<re_...>
EMAIL_FROM=Tremia <onboarding@resend.dev>

# Jobs: Railway no duerme el servicio, así que el cron interno basta.
VENCIMIENTOS_JOB_ENABLED=true
JOBS_SECRET=<cadena aleatoria larga>
```

   No definas `PORT`: Railway la inyecta.

4. Despliega. Al arrancar en Railway el backend revisa las variables
   (`src/config/production-env.ts`):
   - Si falta una obligatoria, **no arranca** y el log dice cuál (nunca su valor).
   - Si algún proveedor quedó en `fake` o una URL apunta a localhost, deja un `WARN` en el log.
5. Verifica:
   - `https://<backend>.up.railway.app/api/health` → `{"ok":true}` (es el health check de Railway).
   - `https://<backend>.up.railway.app/api/health/db` → `{"ok":true}` (conexión con Supabase; 503 si falla).

## 3. Vercel (frontend)

1. *Add New → Project* → el mismo repositorio.
2. *Root Directory*: `frontend`. Vercel detecta Astro solo (build `astro build`, salida `dist`).
3. *Environment Variables*: `PUBLIC_API_URL=https://<backend>.up.railway.app/api`.
   Es de build: si la cambias, vuelve a desplegar (*Redeploy*).
4. Copia el dominio de producción (`https://<tu-app>.vercel.app`) y ponlo en Railway en
   `FRONTEND_URL` y `WOMPI_REDIRECT_URL`, y en Supabase (paso 1.3). CORS solo acepta ese origen:
   las URL de *preview* de Vercel no funcionarán contra el backend, usa siempre la de producción.

## 4. Meta (WhatsApp)

Detalle completo en `Backend/docs/whatsapp-meta.md`. Para la demo:

1. **Token permanente**: Business Manager → *Usuarios del sistema* → crea uno (admin), asígnale la app
   y la cuenta de WhatsApp, y genera un token con `whatsapp_business_messaging` y
   `whatsapp_business_management`. Ese va en `WHATSAPP_ACCESS_TOKEN`. El token temporal del panel
   caduca en ~24 h y es el fallo más probable el día de la demo.
2. *WhatsApp → Configuración → Webhook → Editar*:
   - URL: `https://<backend>.up.railway.app/api/whatsapp/webhook`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`.
   - Suscribe el campo **`messages`**.
3. Agrega como destinatarios verificados los teléfonos que se usarán en la demo (máximo 5).
4. Desde la app (pantalla *Vincular WhatsApp*), vincula el número con el *Phone number ID* y el
   *WhatsApp Business Account ID*.

## 5. Wompi (sandbox)

1. Panel de Wompi (modo pruebas) → *Desarrolladores* → *URL de eventos*:
   `https://<backend>.up.railway.app/api/payments/webhook`
2. Las llaves deben ser las de **pruebas** (`prv_test_`, `test_events_`).
3. Pago de prueba: tarjeta `4242 4242 4242 4242` (aprobada), cualquier CVC y fecha futura.

## 6. Resend

Sin dominio verificado solo se entrega al correo con el que se creó la cuenta de Resend. Para la demo,
el dueño del negocio que se muestre debe usar ese correo (o verifica un dominio y cambia `EMAIL_FROM`).

---

## Prueba completa (hacerla al menos dos veces antes de la demo)

- [ ] `/api/health` y `/api/health/db` responden `{"ok":true}`.
- [ ] Logs de Railway sin `WARN` de proveedores fake ni de localhost.
- [ ] Registro e inicio de sesión (correo y Google) desde la URL de Vercel.
- [ ] Crear negocio, catálogo y configurar el agente.
- [ ] Comprar un plan con Wompi sandbox → vuelve a `/billing` → plan **activo**.
- [ ] Vincular WhatsApp → estado conectado.
- [ ] Escribir al número desde un teléfono verificado → respuesta del agente en < 10 s.
- [ ] Hacer un pedido por WhatsApp → aparece en *Pedidos* → confirmarlo → llega el aviso al cliente.
- [ ] (Opcional) `POST /api/subscriptions/jobs/vencimientos` con `x-jobs-secret` → correo en Resend.

## Día de la demo

- [ ] En la mañana: probar que el token de Meta sigue vigente (mandar un mensaje).
- [ ] 5 minutos antes: abrir la app y mandar un mensaje de prueba.
- [ ] Usar solo teléfonos verificados en Meta. Responder dentro de la ventana de 24 h.
- [ ] Tener a mano el plan B.

## Plan B: backend local con ngrok

1. En `Backend/.env` pon las mismas variables que en Railway (con `FRONTEND_URL` igual a la de Vercel).
2. `npm run build && npm run start:prod` y en otra terminal `ngrok http 3000`.
3. En Meta, cambia la URL del webhook a `https://<ngrok>/api/whatsapp/webhook` (mismo verify token).
4. En Vercel cambia `PUBLIC_API_URL` a `https://<ngrok>/api` y *Redeploy*, o haz la demo con el
   front local (`npm run dev`) con `PUBLIC_API_URL` apuntando a ngrok.
5. Si hay pagos, cambia también la URL de eventos de Wompi.

Pruébalo una vez antes del miércoles; con ngrok gratis la URL puede cambiar al reiniciarlo.
