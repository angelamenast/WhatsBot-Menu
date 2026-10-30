import 'reflect-metadata';
import { jest } from '@jest/globals';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { WhatsappOnboardingController } from './whatsapp-onboarding.controller';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { PlanActivoGuard } from '../../../subscriptions/infrastructure/presentation/guards/plan-activo.guard';
import { ObtenerEstadoSuscripcionUseCase } from '../../../subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';
import { ConnectWhatsappUseCase } from '../../application/use-cases/connect-whatsapp.use-case';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';

describe('WhatsappOnboardingController', () => {
  let app: INestApplication<App>;
  let connectWhatsappUseCase: { execute: any };
  let businessService: { findByUsuario: any };
  let estadoSuscripcion: { execute: any };

  const authenticatedUser = { id: 'user-1' };
  const business = { id: 'business-1' };
  const phoneNumberId = '106540352242922';
  const wabaId = '102290129340398';
  const body = { phoneNumberId, wabaId };

  beforeEach(async () => {
    connectWhatsappUseCase = { execute: jest.fn() as any };
    // PlanActivoGuard real; solo se simula el estado de la suscripción que consulta.
    estadoSuscripcion = {
      execute: (jest.fn() as any).mockResolvedValue({ puedeEditar: true }),
    };
    businessService = {
      findByUsuario: (jest.fn() as any).mockResolvedValue(business),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappOnboardingController],
      providers: [
        { provide: ConnectWhatsappUseCase, useValue: connectWhatsappUseCase },
        { provide: BusinessService, useValue: businessService },
        { provide: ObtenerEstadoSuscripcionUseCase, useValue: estadoSuscripcion },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = authenticatedUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('plan vencido: el dashboard es de solo lectura (HU-8.5)', () => {
    it('la clase lleva SupabaseAuthGuard y connect lleva PlanActivoGuard a nivel de método', () => {
      const classGuards = Reflect.getMetadata('__guards__', WhatsappOnboardingController);
      const methodGuards = Reflect.getMetadata(
        '__guards__',
        WhatsappOnboardingController.prototype.connect,
      );

      expect(classGuards).toContain(SupabaseAuthGuard);
      expect(classGuards).not.toContain(PlanActivoGuard);
      expect(methodGuards).toContain(PlanActivoGuard);
    });

    it('POST /whatsapp/connections con plan VENCIDO → 403 PLAN_VENCIDO y no se conecta nada', async () => {
      estadoSuscripcion.execute.mockResolvedValue({ puedeEditar: false });

      const response = await request(app.getHttpServer())
        .post('/whatsapp/connections')
        .send(body)
        .expect(403);

      expect(response.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Tu plan venció. Renueva para editar.',
      codigo: 'PLAN_VENCIDO',
    });
      expect(connectWhatsappUseCase.execute).not.toHaveBeenCalled();
    });

    it('con SIN_PLAN (puedeEditar true) el onboarding sigue funcionando', async () => {
      estadoSuscripcion.execute.mockResolvedValue({ estado: 'SIN_PLAN', puedeEditar: true });
      connectWhatsappUseCase.execute.mockResolvedValue(
        WhatsappConnection.create({
          id: 'connection-1',
          businessId: business.id,
          phoneNumberId,
          wabaId,
          phoneNumber: '15550253483',
          status: WhatsappConnectionStatus.CONNECTED,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      await request(app.getHttpServer())
        .post('/whatsapp/connections')
        .send(body)
        .expect(201);

      expect(connectWhatsappUseCase.execute).toHaveBeenCalledTimes(1);
    });
  });

  it('número disponible + vinculación exitosa: responde 201 con la conexión CONNECTED', async () => {
    connectWhatsappUseCase.execute.mockResolvedValue(
      WhatsappConnection.create({
        id: 'connection-1',
        businessId: business.id,
        phoneNumberId,
        wabaId,
        phoneNumber: '15550253483',
        status: WhatsappConnectionStatus.CONNECTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/whatsapp/connections')
      .send(body)
      .expect(201);

    expect(businessService.findByUsuario).toHaveBeenCalledWith(
      authenticatedUser.id,
    );
    expect(connectWhatsappUseCase.execute).toHaveBeenCalledWith({
      businessId: business.id,
      phoneNumberId,
      wabaId,
    });
    expect(response.body).toMatchObject({
      status: WhatsappConnectionStatus.CONNECTED,
      phoneNumberId,
      wabaId,
      phoneNumber: '15550253483',
    });
  });

  it('número ya vinculado a otro negocio: responde 409', async () => {
    connectWhatsappUseCase.execute.mockRejectedValue(
      new PhoneNumberAlreadyLinkedError(phoneNumberId),
    );

    await request(app.getHttpServer())
      .post('/whatsapp/connections')
      .send(body)
      .expect(409);
  });

  it.each([
    ['sin cuerpo', {}],
    ['phoneNumberId con caracteres no numéricos', { phoneNumberId: '+573000000000', wabaId }],
    ['wabaId vacío', { phoneNumberId, wabaId: '' }],
    ['falta wabaId', { phoneNumberId }],
    ['el campo retirado phoneNumber no sirve', { phoneNumber: '+573000000000' }],
  ])('validación: %s → 400 y no se conecta nada', async (_label, payload) => {
    await request(app.getHttpServer()).post('/whatsapp/connections').send(payload).expect(400);

    expect(connectWhatsappUseCase.execute).not.toHaveBeenCalled();
  });

  it('la vinculación falla: responde 200 con la conexión en estado FAILED', async () => {
    connectWhatsappUseCase.execute.mockResolvedValue(
      WhatsappConnection.create({
        id: 'connection-1',
        businessId: business.id,
        phoneNumberId,
        wabaId,
        phoneNumber: null,
        status: WhatsappConnectionStatus.FAILED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/whatsapp/connections')
      .send(body)
      .expect(200);

    expect(response.body.status).toBe(WhatsappConnectionStatus.FAILED);
  });
});
