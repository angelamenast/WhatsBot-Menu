# WhatsBot Menu

## Desarrollo local

1. En `Backend`, copia `.env.example` a `.env` y configura las credenciales reales de Supabase. El servidor carga `.env`; `.env.example` solo documenta la configuración.
2. Ejecuta `npm ci` y `npm run start:dev` en `Backend`.
3. En `frontend`, copia `.env.example` a `.env`, ejecuta `npm ci` y `npm run dev`.

El frontend está en `http://localhost:4321` y la API en `http://localhost:3000/api`. `PUBLIC_NEST_API_URL` debe incluir `/api/auth`. `FRONTEND_URL` configura el origen permitido por CORS y el callback de Google.

Para Google OAuth, habilita el proveedor en Supabase y autoriza `http://localhost:4321/auth/callback` (o el equivalente del entorno desplegado) en la lista de redirecciones. El callback recibe la sesión de Supabase mediante el fragmento de la URL.

La API conserva los módulos y contratos de `develop`: login y refresh devuelven `accessToken`, `refreshToken` y `expiresIn`. El servicio del frontend adapta el login al formato utilizado por sus páginas. `GET /api/auth/me` requiere un Bearer token y `GET /api/auth/google` inicia OAuth.

## Validación

- Backend: `npm run build`, `npm test -- --runInBand`, `npm run lint`.
- Frontend: `npm run build`.

Los flujos reales de Supabase, Google y pagos requieren las credenciales y configuración del entorno correspondiente. Varias pantallas del frontend aún contienen datos de demostración de la rama `front/setup`.
