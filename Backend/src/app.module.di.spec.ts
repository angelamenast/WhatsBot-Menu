import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from './shared/supabase/supabase.service';
import { ORDER_PORT } from './modules/agent/application/ports/out/order.port';
import { OrdersOrderAdapter } from './modules/agent/infrastructure/adapters/orders-order.adapter';
import { FakeOrderProvider } from './modules/agent/infrastructure/adapters/fake-order.adapter';
import { ORDER_EVENTS_PORT } from './modules/orders/application/ports/out/order-events.port';
import { EventEmitterOrderEventsAdapter } from './modules/orders/infrastructure/events/event-emitter-order-events.adapter';
import { PlanActivoGuard } from './modules/subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { OrderStatusChangedListener } from './modules/whatsapp/presentation/listeners/order-status-changed.listener';

/**
 * Test de humo de inyección de dependencias: compila el AppModule COMPLETO (sin
 * levantar el servidor ni ejecutar hooks de ciclo de vida, así que no arranca
 * el cron de vencimientos) con Supabase reemplazado por un stub. Detecta
 * providers sin resolver, imports circulares de módulos y tokens mal cableados.
 */
describe('AppModule (humo de DI)', () => {
  const ENV_KEYS = [
    'ORDER_PROVIDER',
    'MESSAGING_PROVIDER',
    'PROVISIONING_PROVIDER',
    'PLAN_STATUS_PROVIDER',
    'AGENT_DISPATCH_PROVIDER',
    'LLM_PROVIDER',
    'CATALOG_PROVIDER',
    'EMAIL_PROVIDER',
  ] as const;

  const originalEnv: Record<string, string | undefined> = {};

  let AppModule: new () => unknown;

  beforeAll(async () => {
    // @nestjs/throttler es CommonJS: con Jest en modo ESM hay que cargar el árbol
    // de módulos de forma dinámica, cuando @nestjs/common ya está evaluado
    // (mismo motivo que en orders.controller.spec). La ruta va en variable porque
    // con module nodenext tsc exige extensión en import() literales.
    const appModulePath = './app.module';
    ({ AppModule } = await import(appModulePath));
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      process.env[key] = 'fake';
    }
    // Lo que ya está en process.env tiene prioridad sobre el .env local.
    process.env.EMAIL_PROVIDER = 'log';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  const compileApp = (): Promise<TestingModule> =>
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService)
      .useValue({ getClient: () => ({}) })
      .compile();

  it('con ORDER_PROVIDER=orders, ORDER_PORT resuelve a OrdersOrderAdapter', async () => {
    process.env.ORDER_PROVIDER = 'orders';
    const moduleRef = await compileApp();

    expect(moduleRef.get(ORDER_PORT, { strict: false })).toBeInstanceOf(
      OrdersOrderAdapter,
    );

    await moduleRef.close();
  });

  it('con ORDER_PROVIDER=fake, ORDER_PORT resuelve a FakeOrderProvider', async () => {
    const moduleRef = await compileApp();

    expect(moduleRef.get(ORDER_PORT, { strict: false })).toBeInstanceOf(
      FakeOrderProvider,
    );

    await moduleRef.close();
  });

  it('el puerto de eventos de orders y el listener de whatsapp quedan registrados', async () => {
    const moduleRef = await compileApp();

    expect(moduleRef.get(ORDER_EVENTS_PORT, { strict: false })).toBeInstanceOf(
      EventEmitterOrderEventsAdapter,
    );
    expect(
      moduleRef.get(OrderStatusChangedListener, { strict: false }),
    ).toBeInstanceOf(OrderStatusChangedListener);

    await moduleRef.close();
  });

  it('PlanActivoGuard queda disponible: lo usan los controllers de orders, agent y whatsapp (compilar AppModule instancia esos guards)', async () => {
    const moduleRef = await compileApp();

    expect(moduleRef.get(PlanActivoGuard, { strict: false })).toBeInstanceOf(
      PlanActivoGuard,
    );

    await moduleRef.close();
  });

  it('la opción retirada ORDER_PROVIDER=supabase ahora es inválida y falla al compilar', async () => {
    process.env.ORDER_PROVIDER = 'supabase';

    await expect(compileApp()).rejects.toThrow(/ORDER_PROVIDER inválido/);
  });
});
