import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BusinessService } from '../src/modules/business/business.service';
import { SupabaseService } from '../src/shared/supabase/supabase.service';
import { NEGOCIO_REPOSITORY } from '../src/modules/business/domain/repositories/negocio.repository';
import { PLAN_REPOSITORY } from '../src/modules/payments/domain/repositories/plan.repository';
import { LoginUseCase } from '../src/modules/auth/application/use-cases/login-user.use-case';
import { ListOrdersByBusinessUseCase } from '../src/modules/orders/application/use-cases/list-orders-by-business.use-case';
import { ObtenerEstadoSuscripcionUseCase } from '../src/modules/subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';
import { GenerarLinkPagoUseCase } from '../src/modules/payments/domain/repositories/application/use-cases/generar-link-pago.use-case';

describe('Contrato HTTP del frontend', () => {
  let app: INestApplication;
  const businessId = '11111111-1111-4111-8111-111111111111';
  const planId = '22222222-2222-4222-8222-222222222222';
  const business = { id: businessId, nombreNegocio: 'Tremia', numeroWhatsapp: '+573001234567' };
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SupabaseService).useValue({ getClient: () => ({
        auth: { getUser: async (token: string) => token === 'valid' ? { data: { user: { id: 'owner', email: 'owner@example.com', user_metadata: {} } }, error: null } : { data: { user: null }, error: {} } },
        from: () => ({ upsert: async () => ({ error: null }) }),
      }) })
      .overrideProvider(NEGOCIO_REPOSITORY).useValue({ buscarPorUsuario: async () => business })
      .overrideProvider(BusinessService).useValue({ findByUsuario: async () => business })
      .overrideProvider(PLAN_REPOSITORY).useValue({ obtenerTodos: async () => [{ id: planId, nombre: 'Plan mensual', precio: 50000 }] })
      .overrideProvider(LoginUseCase).useValue({ execute: async () => ({ accessToken: 'valid', refreshToken: 'refresh', expiresIn: 3600 }) })
      .overrideProvider(ListOrdersByBusinessUseCase).useValue({ execute: async () => ({ items: [], total: 0 }) })
      .overrideProvider(ObtenerEstadoSuscripcionUseCase).useValue({ execute: async () => ({ estado: 'ACTIVO', suscripcionId: 'sub', plan: { id: planId, nombre: 'Plan mensual', precio: 50000 }, fechaFin: new Date('2026-12-01T00:00:00Z'), diasRestantes: 30, puedeEditar: true, alerta: null }) })
      .overrideProvider(GenerarLinkPagoUseCase).useValue({ execute: async () => ({ paymentUrl: 'https://checkout.wompi.co/l/test', suscripcionId: 'sub' }) })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('login conserva el formato camelCase consumido por el adaptador del frontend', async () => {
    const result = await request(app.getHttpServer()).post('/api/auth/login').send({email:'owner@example.com',password:'password123'}).expect(201);
    expect(result.body.accessToken).toBe('valid');expect(result.body.refreshToken).toBe('refresh');
  });
  it('protege las rutas privadas y permite cargar el perfil y preparar OAuth', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    const result=await request(app.getHttpServer()).get('/api/auth/me').set('Authorization','Bearer valid').expect(200);
    expect(result.body.user.id).toBe('owner');
    await request(app.getHttpServer()).post('/api/auth/bootstrap').set('Authorization','Bearer valid').expect(201);
  });
  it('expone negocio, planes y pedidos con las formas que consume la interfaz', async () => {
    const mine=await request(app.getHttpServer()).get('/api/business/mine').set('Authorization','Bearer valid').expect(200);
    expect(mine.body.nombreNegocio).toBe('Tremia');
    const plans=await request(app.getHttpServer()).get('/api/payments/plans').expect(200);expect(plans.body[0].id).toBe(planId);
    const orders=await request(app.getHttpServer()).get('/api/orders?limit=30&offset=0').set('Authorization','Bearer valid').expect(200);
    expect(orders.body).toEqual({ data: [], total: 0, limit: 30, offset: 0 });
  });
  it('consulta vigencia y genera checkout, rechazando negocios ajenos', async () => {
    const status=await request(app.getHttpServer()).get('/api/subscriptions/status').set('Authorization','Bearer valid').expect(200);
    expect(status.body.fechaFin).toBe('2026-12-01T00:00:00.000Z');
    const checkout=await request(app.getHttpServer()).post('/api/payments/generate-link').set('Authorization','Bearer valid').send({planId}).expect(201);
    expect(checkout.body.paymentUrl).toMatch(/^https:\/\/checkout.wompi.co/);
    await request(app.getHttpServer()).post('/api/payments/generate-link').set('Authorization','Bearer valid').send({planId,negocioId:'33333333-3333-4333-8333-333333333333'}).expect(404);
  });
});
