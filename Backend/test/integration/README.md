# Pruebas de integración contra Supabase

Prueban los repositorios reales (`infrastructure/persistence` y los adaptadores de cuota de IA) contra
una base Supabase **de pruebas**: tablas, CHECK, índices únicos parciales y funciones RPC.
No usan mocks (eso es `*.spec.ts`) ni HTTP (eso es `*.e2e-spec.ts`).

## Seguridad

- Solo leen `SUPABASE_TEST_URL` y `SUPABASE_TEST_SERVICE_ROLE_KEY` de `Backend/.env.test`.
- La corrida **aborta** si faltan, o si la URL o la clave coinciden con las de `Backend/.env`.
- Todo dato creado lleva el prefijo `it_<runId>` y se borra en `afterAll`, hijos antes que padres.
  Si algo no se puede borrar, se imprime la tabla y el id que quedaron.

## Preparar la base de pruebas (una sola vez)

En el SQL Editor del proyecto de pruebas, ejecuta en este orden:

1. `Backend/supabase/schema_snapshot.sql`
2. `Backend/supabase/migrations/20261103140000_add_modelo_to_consumo_ia.sql` (el snapshot es anterior a esta migración)
3. Los estados de pedido (el snapshot trae la tabla sin datos):

   ```sql
   insert into public.estados_pedido (codigo, orden) values
     ('pendiente', 1), ('confirmado', 2), ('cancelado', 3)
   on conflict (codigo) do nothing;
   ```

Antes de los tests, `support/global-setup.ts` comprueba las tablas, `estados_pedido`, `consumo_ia.modelo`
y las RPC. Si falta algo, dice qué es.

## Correr

```bash
cd Backend
cp .env.test.example .env.test   # y completa los valores del proyecto de pruebas
npm run test:int
npm run test:int -- --json --outputFile=test-results/integration.json   # evidencia en JSON
```

## Wompi (sandbox)

`wompi/wompi-adapter.int-spec.ts` prueba el adaptador contra el sandbox real y la firma de eventos;
`wompi/payment-flow.int-spec.ts` levanta la app completa (AppModule + supertest) y recorre
generate-link → webhook firmado → Supabase de pruebas.

- Variables `WOMPI_TEST_*` en `.env.test`. Si faltan, estas pruebas se **saltan** con aviso.
- Abortan si la URL no contiene `sandbox`, si `pub_`/`prv_` no contienen `_test_` o si el secret de eventos no empieza por `test_`.
- La app de pruebas usa una config cerrada (`support/test-app.ts`): Supabase y Wompi de pruebas, proveedores en `fake` y el job de vencimientos apagado. No lee `Backend/.env`.
- Los links creados en el sandbox no se pueden borrar; su nombre empieza por `it_` / `Suscripción it_...`.

## Estructura

- `*.int-spec.ts`: un archivo por área (catálogo, pagos, pedidos, WhatsApp, cuota de IA); cada `it` lleva un ID `IT-DB-NN`.
- `support/env.ts`: carga y valida `.env.test`.
- `support/supabase-test-client.ts`: cliente de pruebas y sustituto de `SupabaseService` (solo `getClient()`).
- `support/test-context.ts`: crea usuario (`auth.admin.createUser`), perfil, negocio, planes y conversaciones, y limpia todo al final.
