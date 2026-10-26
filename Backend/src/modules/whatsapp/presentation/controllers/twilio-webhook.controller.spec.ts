import { jest } from '@jest/globals';
import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import 'reflect-metadata';
import type { TwilioWebhookController as TwilioWebhookControllerClass } from './twilio-webhook.controller';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';

describe('TwilioWebhookController', () => {
  // Carga dinámica: @nestjs/throttler es CommonJS y, con Jest en modo ESM, falla si se importa
  // estáticamente antes de que @nestjs/common esté evaluado (mismo caso que orders.controller.spec).
  let TwilioWebhookController: typeof TwilioWebhookControllerClass;

  beforeAll(async () => {
    const controllerPath = './twilio-webhook.controller';
    ({ TwilioWebhookController } = await import(controllerPath));
  });

  let app: INestApplication<App>;
  let handleIncomingMessageUseCase: { execute: any };

  beforeEach(async () => {
    const executeMock = jest.fn() as any;
    executeMock.mockResolvedValue(undefined);

    handleIncomingMessageUseCase = { execute: executeMock };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TwilioWebhookController],
      providers: [
        {
          provide: HandleIncomingMessageUseCase,
          useValue: handleIncomingMessageUseCase,
        },
      ],
    })
      .overrideGuard(TwilioSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('payload válido: responde 200 e invoca el use case con el command correcto', async () => {
    const payload = {
      From: '+573001111111',
      To: '+573000000000',
      Body: 'Hola, quiero ver el menú',
      MessageSid: 'SM123456789',
    };

    await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .type('form')
      .send(payload)
      .expect(200);

    expect(handleIncomingMessageUseCase.execute).toHaveBeenCalledWith({
      toPhoneNumber: payload.To,
      fromCustomerNumber: payload.From,
      body: payload.Body,
      providerMessageId: payload.MessageSid,
    });
  });

  it('número To no asociado a ningún negocio: responde 200 y loguea un warning (sin reintentos de Twilio)', async () => {
    const payload = {
      From: '+573001111111',
      To: '+573009999999',
      Body: 'Hola',
      MessageSid: 'SM987654321',
    };

    handleIncomingMessageUseCase.execute.mockRejectedValueOnce(
      new WhatsappConnectionNotFoundError(payload.To),
    );

    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .type('form')
      .send(payload)
      .expect(200);

    const logged = String(warnSpy.mock.calls[0][0]);
    expect(logged).toContain(payload.MessageSid);
    expect(logged).not.toContain(payload.To);
    expect(logged).not.toContain(payload.From);
    expect(logged).not.toContain(payload.Body);

    warnSpy.mockRestore();
  });

  it('omite el throttler global: Twilio llama desde IPs compartidas por todos los negocios', () => {
    // Metadata que escribe @SkipThrottle() (THROTTLER_SKIP + nombre del throttler).
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', TwilioWebhookController)).toBe(true);
  });
});
