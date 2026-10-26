import { jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import 'reflect-metadata';
import type { TwilioStatusCallbackController as TwilioStatusCallbackControllerClass } from './twilio-status-callback.controller';
import { TwilioSignatureGuard } from '../guards/twilio-signature.guard';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';

describe('TwilioStatusCallbackController', () => {
  // Carga dinámica por @nestjs/throttler (CommonJS) con Jest en modo ESM; ver twilio-webhook.controller.spec.
  let TwilioStatusCallbackController: typeof TwilioStatusCallbackControllerClass;

  beforeAll(async () => {
    const controllerPath = './twilio-status-callback.controller';
    ({ TwilioStatusCallbackController } = await import(controllerPath));
  });

  let app: INestApplication<App>;
  let handleStatusCallbackUseCase: { execute: any };
  
  beforeEach(async () => {
    const executeMock = jest.fn() as any;
    executeMock.mockResolvedValue(undefined);

    handleStatusCallbackUseCase = {
      execute: executeMock,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TwilioStatusCallbackController],
      providers: [
        {
          provide: HandleStatusCallbackUseCase,
          useValue: handleStatusCallbackUseCase,
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

  it('omite el throttler global: Twilio llama desde IPs compartidas por todos los negocios', () => {
    // Metadata que escribe @SkipThrottle() (THROTTLER_SKIP + nombre del throttler).
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', TwilioStatusCallbackController)).toBe(true);
  });
});
