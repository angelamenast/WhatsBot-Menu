# WhatsBot Menu

## Inicio local

Requisitos: una versión de Node compatible con las dependencias (Node 24.15 o superior en la rama 24) y npm.

1. En Backend, copia .env.example a .env y sustituye SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY por los valores de tu proyecto. Aplica las migraciones de Backend/supabase/migrations al proyecto correspondiente. El archivo schema_snapshot.sql sirve como referencia del esquema existente.
2. Ejecuta npm ci y npm run start:dev en Backend.
3. En frontend, copia .env.example a .env si necesitas cambiar la dirección de la API. Por defecto usa http://localhost:3000/api. Ejecuta npm ci y npm run dev.
4. Abre http://localhost:4321, crea una cuenta y registra el negocio en Perfil.

El servidor carga .env, no .env.example. Ninguna clave privada debe añadirse al frontend ni al repositorio.

## Configuración de servicios

- Supabase: configura URL y service role en el backend. Para Google, habilita el proveedor y permite http://localhost:4321/auth/callback como redirección. Los usuarios de Google preparan su perfil mediante POST /api/auth/bootstrap antes de crear el negocio.
- Wompi: configura WOMPI_BASE_URL, WOMPI_PRIVATE_KEY y WOMPI_EVENTS_SECRET. El ejemplo usa sandbox. WOMPI_REDIRECT_URL vuelve a /billing. El webhook público debe apuntar a /api/payments/webhook. La suscripción solo se activa cuando el servidor valida la notificación de Wompi.
- FRONTEND_URL debe coincidir con el origen del frontend para CORS y el callback de Google.
- PUBLIC_API_URL es la raíz de la API, incluyendo /api. Se mantiene compatibilidad con PUBLIC_NEST_API_URL terminado en /api/auth.

## Pantallas conectadas

- Registro, login, Google, renovación de tokens y cierre de sesión.
- Perfil: nombre, solicitud de cambio de correo y contraseña, con validación del servidor.
- Negocio: alta y actualización de nombre, número comercial y descripción.
- Pedidos: listado con fechas y paginación; confirmación y cancelación. Los estados y totales vienen del backend. Un plan vencido mantiene los pedidos en modo de consulta.
- Planes y checkout: precios de la API y redirección al enlace de pago de Wompi. No se recogen tarjetas dentro del frontend.
- Facturación: estado y vencimiento de la suscripción, renovación y consulta del pago de renovación pendiente.
- WhatsApp: consulta y solicitud de conexión por número, y configuración del agente.

## Límites actuales del backend

La integración de las pantallas no implementa los proveedores externos que faltaban en el proyecto: mensajería y aprovisionamiento reales de Twilio, y el proveedor OpenAI del agente. Los adaptadores de WhatsApp y LLM disponibles siguen siendo fake; la pantalla identifica las conexiones de prueba. No hay QR real, métricas de consumo ni facturas fiscales proporcionadas por esta API. Las pantallas conectadas no presentan esos datos de demostración como si fueran reales.

Sin un .env real de Supabase no se puede autenticar ni guardar datos. Sin claves de Wompi no se puede crear un enlace de pago. Las pruebas automatizadas reemplazan esos servicios; no certifican pagos o mensajes reales.

## Verificación

Backend: npm run build, npm test -- --runInBand, npm run test:e2e -- --runInBand, npm run lint.
Frontend: npm run check, npm run build, npm test.

Los tests de contrato HTTP validan /api/auth, /api/business, /api/orders, /api/payments y /api/subscriptions con servicios controlados. Los tests del cliente comprueban el refresh concurrente, errores, sesión inválida y contratos de checkout.

El error del editor sobre imports de global.css se resuelve con src/env.d.ts y los tipos de astro/client. Si el editor conserva un diagnóstico antiguo tras instalar dependencias, ejecuta TypeScript: Restart TS Server desde la paleta de comandos de VS Code.
