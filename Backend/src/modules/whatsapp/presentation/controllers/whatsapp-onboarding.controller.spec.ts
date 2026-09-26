import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { WhatsappOnboardingController } from './whatsapp-onboarding.controller';
import { SupabaseAuthGuard } from '../../../auth/guards/supabase-auth.guard';
import { BusinessService } from '../../../business/business.service';
import { ConnectWhatsappUseCase } from '../../application/use-cases/connect-whatsapp.use-case';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';
import { PhoneNumberAlreadyLinkedError } from '../../domain/errors/whatsapp.errors';

describe('WhatsappOnboardingController', () => {
  let app: INestApplication<App>;
  let connectWhatsappUseCase: { execute: jest.Mock };
  let businessService: { findByUsuario: jest.Mock };

  const authenticatedUser = { id: 'user-1' };
  const business = { id: 'business-1' };
  const phoneNumber = '+573000000000';

  beforeEach(async () => {
    connectWhatsappUseCase = { execute: jest.fn() };
    businessService = { findByUsuario: jest.fn().mockResolvedValue(business) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappOnboardingController],
      providers: [
        { provide: ConnectWhatsappUseCase, useValue: connectWhatsappUseCase },
        { provide: BusinessService, useValue: businessService },
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('número disponible + provisioning exitoso: responde 201 con la conexión CONNECTED', async () => {
    connectWhatsappUseCase.execute.mockResolvedValue(
      WhatsappConnection.create({
        id: 'connection-1',
        businessId: business.id,
        phoneNumber,
        twilioSubaccountSid: 'AC123',
        twilioSenderSid: 'MG123',
        status: WhatsappConnectionStatus.CONNECTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/whatsapp/connections')
      .send({ phoneNumber })
      .expect(201);

    expect(businessService.findByUsuario).toHaveBeenCalledWith(authenticatedUser.id);
    expect(connectWhatsappUseCase.execute).toHaveBeenCalledWith({
      businessId: business.id,
      phoneNumber,
    });
    expect(response.body.status).toBe(WhatsappConnectionStatus.CONNECTED);
  });

  it('número ya vinculado a otro negocio: responde 409', async () => {
    connectWhatsappUseCase.execute.mockRejectedValue(new PhoneNumberAlreadyLinkedError(phoneNumber));

    await request(app.getHttpServer()).post('/whatsapp/connections').send({ phoneNumber }).expect(409);
  });

  it('provisioning falla: responde 200 con la conexión en estado FAILED', async () => {
    connectWhatsappUseCase.execute.mockResolvedValue(
      WhatsappConnection.create({
        id: 'connection-1',
        businessId: business.id,
        phoneNumber,
        twilioSubaccountSid: null,
        twilioSenderSid: null,
        status: WhatsappConnectionStatus.FAILED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/whatsapp/connections')
      .send({ phoneNumber })
      .expect(200);

    expect(response.body.status).toBe(WhatsappConnectionStatus.FAILED);
  });
});
