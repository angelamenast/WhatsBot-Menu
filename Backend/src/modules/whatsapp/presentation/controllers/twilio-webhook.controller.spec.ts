import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { TwilioWebhookController } from './twilio-webhook.controller';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';

describe('TwilioWebhookController', () => {
  let app: INestApplication<App>;
  let handleIncomingMessageUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    handleIncomingMessageUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TwilioWebhookController],
      providers: [{ provide: HandleIncomingMessageUseCase, useValue: handleIncomingMessageUseCase }],
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

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await request(app.getHttpServer())
      .post('/whatsapp/webhook')
      .type('form')
      .send(payload)
      .expect(200);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(payload.To));

    warnSpy.mockRestore();
  });
});
