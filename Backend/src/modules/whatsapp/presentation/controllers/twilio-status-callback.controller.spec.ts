import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { TwilioStatusCallbackController } from './twilio-status-callback.controller';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';

describe('TwilioStatusCallbackController', () => {
  let app: INestApplication<App>;
  let handleStatusCallbackUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    handleStatusCallbackUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TwilioStatusCallbackController],
      providers: [{ provide: HandleStatusCallbackUseCase, useValue: handleStatusCallbackUseCase }],
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
      MessageSid: 'SM123456789',
      MessageStatus: 'delivered',
    };

    await request(app.getHttpServer())
      .post('/whatsapp/status-callback')
      .type('form')
      .send(payload)
      .expect(200);

    expect(handleStatusCallbackUseCase.execute).toHaveBeenCalledWith({
      providerMessageId: payload.MessageSid,
      status: payload.MessageStatus,
    });
  });
});
