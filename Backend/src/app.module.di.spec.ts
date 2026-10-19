import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from './shared/supabase/supabase.service';
import { CATALOG_REPOSITORY } from './modules/agent/domain/repositories/catalog.repository';
import { SupabaseCatalogRepository } from './modules/agent/infrastructure/persistence/supabase-catalog.repository';
import { FakeCatalogRepository } from './modules/agent/infrastructure/persistence/fake-catalog.repository';
import { USAGE_QUOTA_PORT } from './modules/agent/application/ports/out/usage-quota.port';
import { FakeUsageQuotaProvider } from './modules/agent/infrastructure/adapters/fake-usage-quota.adapter';
import { SupabaseUsageQuotaAdapter } from './modules/agent/infrastructure/adapters/supabase-usage-quota.adapter';
import { ORDER_PORT } from './modules/agent/application/ports/out/order.port';
import { OrdersOrderAdapter } from './modules/agent/infrastructure/adapters/orders-order.adapter';
import { FakeOrderProvider } from './modules/agent/infrastructure/adapters/fake-order.adapter';
import { ORDER_EVENTS_PORT } from './modules/orders/application/ports/out/order-events.port';
import { EventEmitterOrderEventsAdapter } from './modules/orders/infrastructure/events/event-emitter-order-events.adapter';
import { PLAN_STATUS_PORT } from './modules/whatsapp/application/ports/out/plan-status.port';
import { FakePlanStatusProvider } from './modules/whatsapp/infrastructure/adapters/fake-plan-status.adapter';
import { SubscriptionPlanStatusAdapter } from './modules/subscriptions/infrastructure/adapters/subscription-plan-status.adapter';
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
    'USAGE_QUOTA_PROVIDER',
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

  it('con PLAN_STATUS_PROVIDER=subscriptions, PLAN_STATUS_PORT resuelve al adapter real de subscriptions', async () => {
    process.env.PLAN_STATUS_PROVIDER = 'subscriptions';
    const moduleRef = await compileApp();

    expect(moduleRef.get(PLAN_STATUS_PORT, { strict: false })).toBeInstanceOf(
      SubscriptionPlanStatusAdapter,
    );

    await moduleRef.close();
  });

  it('por defecto (fake), PLAN_STATUS_PORT resuelve a FakePlanStatusProvider', async () => {
    const moduleRef = await compileApp();

    expect(moduleRef.get(PLAN_STATUS_PORT, { strict: false })).toBeInstanceOf(
      FakePlanStatusProvider,
    );

    await moduleRef.close();
  });

  it('un PLAN_STATUS_PROVIDER desconocido falla al compilar', async () => {
    process.env.PLAN_STATUS_PROVIDER = 'otro';

    await expect(compileApp()).rejects.toThrow(/PLAN_STATUS_PROVIDER inválido/);
  });

  it('sin CATALOG_PROVIDER, CATALOG_REPOSITORY resuelve al catálogo real de Supabase (default)', async () => {
    delete process.env.CATALOG_PROVIDER;
    const moduleRef = await compileApp();

    expect(moduleRef.get(CATALOG_REPOSITORY, { strict: false })).toBeInstanceOf(
      SupabaseCatalogRepository,
    );

    await moduleRef.close();
  });

  it('con CATALOG_PROVIDER=fake (explícito), CATALOG_REPOSITORY resuelve al fake', async () => {
    process.env.CATALOG_PROVIDER = 'fake';
    const moduleRef = await compileApp();

    expect(moduleRef.get(CATALOG_REPOSITORY, { strict: false })).toBeInstanceOf(
      FakeCatalogRepository,
    );

    await moduleRef.close();
  });

  it('un CATALOG_PROVIDER inválido falla al compilar', async () => {
    process.env.CATALOG_PROVIDER = 'otro';

    await expect(compileApp()).rejects.toThrow(/CATALOG_PROVIDER inválido/);
  });

  it('USAGE_QUOTA_PORT: fake por defecto y supabase si se pide; un valor inválido falla', async () => {
    delete process.env.USAGE_QUOTA_PROVIDER;
    let moduleRef = await compileApp();
    expect(moduleRef.get(USAGE_QUOTA_PORT, { strict: false })).toBeInstanceOf(FakeUsageQuotaProvider);
    await moduleRef.close();

    process.env.USAGE_QUOTA_PROVIDER = 'supabase';
    moduleRef = await compileApp();
    expect(moduleRef.get(USAGE_QUOTA_PORT, { strict: false })).toBeInstanceOf(SupabaseUsageQuotaAdapter);
    await moduleRef.close();

    process.env.USAGE_QUOTA_PROVIDER = 'otro';
    await expect(compileApp()).rejects.toThrow(/USAGE_QUOTA_PROVIDER inválido/);
  });

  it('la opción retirada ORDER_PROVIDER=supabase ahora es inválida y falla al compilar', async () => {
    process.env.ORDER_PROVIDER = 'supabase';

    await expect(compileApp()).rejects.toThrow(/ORDER_PROVIDER inválido/);
  });
});
