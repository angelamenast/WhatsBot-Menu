import 'reflect-metadata';
import { jest } from '@jest/globals';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHmac } from 'node:crypto';
import type { MetaWebhookController as MetaWebhookControllerClass } from './meta-webhook.controller';
import { HandleIncomingMessageUseCase } from '../../application/use-cases/handle-incoming-message.use-case';
import { HandleStatusCallbackUseCase } from '../../application/use-cases/handle-status-callback.use-case';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';

type AnyFn = (...args: any[]) => any;

describe('MetaWebhookController', () => {
  // Carga dinámica: @nestjs/throttler es CommonJS y, con Jest en modo ESM, falla si se importa
  // estáticamente antes de que @nestjs/common esté evaluado (mismo caso que orders.controller.spec).
  let MetaWebhookController: typeof MetaWebhookControllerClass;
  let MetaSignatureGuard: typeof import('../guards/meta-signature.guard').MetaSignatureGuard;

  beforeAll(async () => {
    const controllerPath = './meta-webhook.controller';
    const guardPath = '../guards/meta-signature.guard';
    ({ MetaWebhookController } = await import(controllerPath));
    ({ MetaSignatureGuard } = await import(guardPath));
  });

  const appSecret = 'app-secret-de-prueba';
  const verifyToken = 'verify-token-de-prueba';
  const env: Record<string, string | undefined> = {};

  let app: INestApplication<App>;
  let handleIncoming: { execute: jest.Mock<AnyFn> };
  let handleStatus: { execute: jest.Mock<AnyFn> };
  let warnSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  const sign = (rawBody: string, secret = appSecret) =>
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

  const textPayload = (id = 'wamid.AAA', from = '573001111111', body = 'Hola, quiero ver el menú') => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550253483', phone_number_id: '106540352242922' },
              contacts: [{ profile: { name: 'Cliente' }, wa_id: from }],
              messages: [{ from, id, timestamp: '1700000000', type: 'text', text: { body } }],
            },
          },
        ],
      },
    ],
  });

  const post = (payload: unknown, signature?: string) => {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const req = request(app.getHttpServer()).post('/whatsapp/webhook').set('Content-Type', 'application/json');
    return req.set('X-Hub-Signature-256', signature ?? sign(raw)).send(raw);
  };

  beforeEach(async () => {
    env.WHATSAPP_APP_SECRET = appSecret;
    env.WHATSAPP_VERIFY_TOKEN = verifyToken;

    handleIncoming = { execute: jest.fn<AnyFn>().mockResolvedValue(undefined) };
    handleStatus = { execute: jest.fn<AnyFn>().mockResolvedValue(undefined) };
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MetaWebhookController],
      providers: [
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: HandleIncomingMessageUseCase, useValue: handleIncoming },
        { provide: HandleStatusCallbackUseCase, useValue: handleStatus },
        MetaSignatureGuard,
      ],
    }).compile();

    // Igual que main.ts: rawBody para la firma y ValidationPipe global (no debe alterar el payload).
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('GET (verificación del webhook)', () => {
    const verify = (query: Record<string, string>) =>
      request(app.getHttpServer()).get('/whatsapp/webhook').query(query);

    it('subscribe + token correcto: 200 con el challenge en texto plano', async () => {
      const response = await verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': '1158201444',
      }).expect(200);

      expect(response.text).toBe('1158201444');
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    it('token incorrecto: 403', async () => {
      await verify({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'otro',
        'hub.challenge': '1158201444',
      }).expect(403);
    });

    it('modo distinto de subscribe: 403', async () => {
      await verify({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': '1158201444',
      }).expect(403);
    });

    it('sin parámetros o sin challenge: 403', async () => {
      await verify({}).expect(403);
      await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken }).expect(403);
    });

    it('sin WHATSAPP_VERIFY_TOKEN configurado (falla cerrada): 403 aunque el token venga vacío', async () => {
      env.WHATSAPP_VERIFY_TOKEN = undefined;

      await verify({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }).expect(403);
    });
  });

  describe('POST (mensajes y estados)', () => {
    it('payload firmado válido: 200 y el use case recibe el comando con el cuerpo parseado', async () => {
      await post(textPayload()).expect(200);
      await flush();

      expect(handleIncoming.execute).toHaveBeenCalledTimes(1);
      expect(handleIncoming.execute).toHaveBeenCalledWith({
        phoneNumberId: '106540352242922',
        customerNumber: '573001111111',
        text: 'Hola, quiero ver el menú',
        providerMessageId: 'wamid.AAA',
      });
      expect(handleStatus.execute).not.toHaveBeenCalled();
    });

    it('responde 200 de inmediato sin esperar a que termine el procesamiento', async () => {
      let release: () => void = () => undefined;
      handleIncoming.execute.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));

      await post(textPayload()).expect(200);

      expect(handleIncoming.execute).toHaveBeenCalledTimes(1);
      release();
    });

    it('estados de entrega: llama al use case de estados con code y message del error', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '106540352242922' },
                  statuses: [
                    { id: 'wamid.S1', status: 'delivered', recipient_id: '573001111111' },
                    {
                      id: 'wamid.S2',
                      status: 'failed',
                      errors: [{ code: 131047, title: 'Re-engagement message' }],
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      await post(payload).expect(200);
      await flush();

      expect(handleStatus.execute.mock.calls.map((args) => args[0])).toEqual([
        { providerMessageId: 'wamid.S1', status: 'delivered' },
        {
          providerMessageId: 'wamid.S2',
          status: 'failed',
          error: { code: 131047, message: 'Re-engagement message' },
        },
      ]);
      expect(handleIncoming.execute).not.toHaveBeenCalled();
    });

    it('varios mensajes en un POST: se procesan todos y en orden', async () => {
      const payload = textPayload('wamid.1');
      payload.entry[0].changes[0].value.messages.push({
        from: '573002222222',
        id: 'wamid.2',
        timestamp: '1700000001',
        type: 'text',
        text: { body: 'Segundo' },
      });

      await post(payload).expect(200);
      await flush();

      expect(handleIncoming.execute.mock.calls.map((args) => args[0].providerMessageId)).toEqual([
        'wamid.1',
        'wamid.2',
      ]);
    });

    it('un fallo en un mensaje no impide procesar los siguientes ni cambia el 200', async () => {
      const payload = textPayload('wamid.1');
      payload.entry[0].changes[0].value.messages.push({
        from: '573002222222',
        id: 'wamid.2',
        timestamp: '1700000001',
        type: 'text',
        text: { body: 'Segundo' },
      });
      handleIncoming.execute.mockRejectedValueOnce(new Error('DB caída'));

      await post(payload).expect(200);
      await flush();

      expect(handleIncoming.execute).toHaveBeenCalledTimes(2);
      expect(String(errorSpy.mock.calls[0][0])).toContain('wamid.1');
    });

    it('número no registrado: 200 y un warning sin teléfono del cliente, texto ni phone_number_id', async () => {
      handleIncoming.execute.mockRejectedValueOnce(
        new WhatsappConnectionNotFoundError('phone_number_id 106540352242922'),
      );

      await post(textPayload('wamid.ZZZ')).expect(200);
      await flush();

      const logged = warnSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
      expect(logged).toContain('wamid.ZZZ');
      expect(logged).not.toContain('573001111111');
      expect(logged).not.toContain('Hola, quiero ver el menú');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('mensaje no textual: 200, no se procesa y el warning solo trae el tipo', async () => {
      const payload = textPayload();
      payload.entry[0].changes[0].value.messages = [
        // @ts-expect-error mensaje de imagen: otra forma que el de texto
        { from: '573001111111', id: 'wamid.IMG', type: 'image', image: { id: 'media-1', caption: 'foto privada' } },
      ];

      await post(payload).expect(200);
      await flush();

      expect(handleIncoming.execute).not.toHaveBeenCalled();
      const logged = warnSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
      expect(logged).toContain('image');
      expect(logged).not.toContain('573001111111');
      expect(logged).not.toContain('foto privada');
    });

    it.each([
      ['objeto vacío', {}],
      ['array', []],
      ['entry malformado', { entry: 'x' }],
    ])('payload inesperado (%s) pero firmado: 200 y no se procesa nada', async (_label, payload) => {
      await post(payload).expect(200);
      await flush();

      expect(handleIncoming.execute).not.toHaveBeenCalled();
      expect(handleStatus.execute).not.toHaveBeenCalled();
    });

    it('JSON inválido con firma correcta: lo rechaza el parser de Express (400), sin procesar', async () => {
      await post('{no es json').expect(400);

      expect(handleIncoming.execute).not.toHaveBeenCalled();
    });
  });

  describe('POST con firma incorrecta', () => {
    it('firma inválida: 401 y no se procesa nada', async () => {
      await post(textPayload(), sign('otro cuerpo')).expect(401);
      await flush();

      expect(handleIncoming.execute).not.toHaveBeenCalled();
      expect(handleStatus.execute).not.toHaveBeenCalled();
    });

    it('firma ausente: 401', async () => {
      await request(app.getHttpServer())
        .post('/whatsapp/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(textPayload()))
        .expect(401);

      expect(handleIncoming.execute).not.toHaveBeenCalled();
    });

    it('sin WHATSAPP_APP_SECRET (falla cerrada): 401', async () => {
      env.WHATSAPP_APP_SECRET = undefined;

      await post(textPayload()).expect(401);

      expect(handleIncoming.execute).not.toHaveBeenCalled();
    });
  });

  it('omite el throttler global: Meta llama desde IPs compartidas por todos los negocios', () => {
    // Metadata que escribe @SkipThrottle() (THROTTLER_SKIP + nombre del throttler).
    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', MetaWebhookController)).toBe(true);
  });
});
