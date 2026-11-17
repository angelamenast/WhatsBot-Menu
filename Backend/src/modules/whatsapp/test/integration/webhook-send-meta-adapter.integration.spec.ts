import { jest } from '@jest/globals';
import { MESSAGING_PORT } from '../../application/ports/out/messaging.port';
import type { MessagingPort } from '../../application/ports/out/messaging.port';
import { MessageSender } from '../../domain/entities/message.entity';
import {
  MessagingWindowClosedError,
  WhatsappProviderAuthError,
  WhatsappProviderError,
  WhatsappProviderTimeoutError,
} from '../../domain/errors/whatsapp.errors';
import { MAX_MESSAGE_BODY_LENGTH } from '../../infrastructure/adapters/meta-messaging.adapter';
import { GRAPH_ACCESS_TOKEN, graphMessagesUrl, timeoutAbortError } from '../support/graph-fetch-stub';
import { DEFAULT_CUSTOMER, DEFAULT_PHONE_NUMBER_ID, statusPayload, textPayload } from '../support/meta-payloads';
import { BUSINESS_A, BUSINESS_B, PHONE_NUMBER_ID_B, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * Envío de la respuesta del agente por el adaptador REAL de Meta (MetaMessagingAdapter + MetaGraphClient)
 * con `fetch` sustituido: nunca hay red real. Recorre el flujo completo webhook → agente → Graph API.
 */
describe('Envío por la Graph API de Meta (flujo completo del webhook)', () => {
  let testApp: WhatsappTestApp;
  let sendSpy: jest.SpiedFunction<MessagingPort['sendMessage']>;

  const url = graphMessagesUrl(DEFAULT_PHONE_NUMBER_ID);
  const accepted = { messaging_product: 'whatsapp', contacts: [{ input: DEFAULT_CUSTOMER, wa_id: DEFAULT_CUSTOMER }], messages: [{ id: 'wamid.OUT.REAL' }] };

  beforeEach(async () => {
    testApp = await createWhatsappTestApp({ messaging: 'meta' });
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
    sendSpy = jest.spyOn(testApp.app.get<MessagingPort>(MESSAGING_PORT), 'sendMessage');
  });

  afterEach(async () => {
    await testApp.close();
  });

  const receive = async (id = 'wamid.IN.1', phoneNumberId = DEFAULT_PHONE_NUMBER_ID) => {
    await testApp.postWebhook(textPayload({ id, phoneNumberId })).expect(200);
    await testApp.settle();
  };

  const reply = () => testApp.messages.all().find((m) => m.sender === MessageSender.AGENT);
  const sendError = () => sendSpy.mock.results[0].value as Promise<unknown>;
  const allLogs = () => [...testApp.logs.warn, ...testApp.logs.error].join('\n');

  describe('2xx', () => {
    it('POST a graph.facebook.com/{version}/{phone_number_id}/messages con Bearer, JSON y el cuerpo de texto', async () => {
      testApp.agent.respondWith('Tu pedido está listo ✅');
      testApp.graph.respondJson(url, accepted);

      await receive();

      expect(testApp.graph.calls).toHaveLength(1);
      const [call] = testApp.graph.calls;
      expect(call.url).toBe('https://graph.facebook.com/v25.0/106540352242922/messages');
      expect(call.method).toBe('POST');
      expect(call.headers).toEqual({ Authorization: `Bearer ${GRAPH_ACCESS_TOKEN}`, 'Content-Type': 'application/json' });
      expect(call.body).toEqual({
        messaging_product: 'whatsapp',
        to: DEFAULT_CUSTOMER,
        type: 'text',
        text: { body: 'Tu pedido está listo ✅' },
      });
      expect(call.signal).toBeInstanceOf(AbortSignal);
    });

    it('guarda la respuesta con el wamid devuelto por Meta y estado "sent"', async () => {
      testApp.graph.respondJson(url, accepted);

      await receive();

      expect(reply()).toMatchObject({ providerMessageId: 'wamid.OUT.REAL', deliveryStatus: 'sent', content: 'Respuesta del agente' });
    });

    it('el estado posterior de Meta se aplica al mensaje enviado por el adaptador real', async () => {
      testApp.graph.respondJson(url, accepted);
      await receive();

      await testApp.postWebhook(statusPayload([{ id: 'wamid.OUT.REAL', status: 'failed' }])).expect(200);
      await testApp.settle();

      expect(reply()?.deliveryStatus).toBe('failed');
    });

    it('cada negocio envía con su propio phone_number_id en la URL', async () => {
      await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);
      testApp.graph.respondJson(url, accepted).respondJson(graphMessagesUrl(PHONE_NUMBER_ID_B), {
        messages: [{ id: 'wamid.OUT.B' }],
      });

      await receive('wamid.IN.A', DEFAULT_PHONE_NUMBER_ID);
      await receive('wamid.IN.B', PHONE_NUMBER_ID_B);

      expect(testApp.graph.calls.map((c) => c.url)).toEqual([url, graphMessagesUrl(PHONE_NUMBER_ID_B)]);
    });

    it('2xx sin id de mensaje en la respuesta: se trata como fallo de envío', async () => {
      testApp.graph.respondJson(url, { messaging_product: 'whatsapp' });

      await receive();

      expect(reply()).toMatchObject({ deliveryStatus: 'failed', providerMessageId: null });
      await expect(sendError()).rejects.toThrow('sin el id del mensaje');
    });
  });

  describe('errores de la API: 200 al webhook, mensaje guardado como "failed", un solo intento', () => {
    it('401 token inválido o expirado (code 190): WhatsappProviderAuthError', async () => {
      testApp.graph.respondGraphError(url, 401, {
        message: 'Error validating access token: Session has expired',
        type: 'OAuthException',
        code: 190,
        fbtrace_id: 'TRACE-190',
      });

      await receive();

      expect(reply()).toMatchObject({ deliveryStatus: 'failed', providerMessageId: null });
      await expect(sendError()).rejects.toBeInstanceOf(WhatsappProviderAuthError);
      expect(allLogs()).toContain('HTTP 401');
      expect(allLogs()).toContain('code=190');
      expect(allLogs()).toContain('fbtrace_id=TRACE-190');
      expect(testApp.graph.calls).toHaveLength(1);
    });

    it('400 fuera de la ventana de 24 h (code 131047): MessagingWindowClosedError', async () => {
      testApp.graph.respondGraphError(url, 400, {
        message: 'Re-engagement message',
        type: 'OAuthException',
        code: 131047,
        fbtrace_id: 'TRACE-131047',
      });

      await receive();

      expect(reply()?.deliveryStatus).toBe('failed');
      await expect(sendError()).rejects.toBeInstanceOf(MessagingWindowClosedError);
      expect(allLogs()).toContain('code=131047');
    });

    // GAP: el cliente solo distingue 190 y 131047 (meta-graph.client.ts:102-109). El resto cae en el error genérico.
    it('429 rate limit (code 130429): NO se distingue; error genérico sin reintento ni espera', async () => {
      testApp.graph.respondGraphError(url, 429, {
        message: '(#130429) Rate limit hit',
        type: 'OAuthException',
        code: 130429,
        fbtrace_id: 'TRACE-130429',
      });

      await receive();

      expect(reply()?.deliveryStatus).toBe('failed');
      const error = (await sendError().catch((e: unknown) => e)) as WhatsappProviderError;
      expect(error.constructor).toBe(WhatsappProviderError);
      expect(error.providerCode).toBe(130429);
      expect(testApp.graph.calls).toHaveLength(1);
    });

    it('400 con otro código (p. ej. 131026, destinatario no válido): error genérico con el código conservado', async () => {
      testApp.graph.respondGraphError(url, 400, { message: 'Message undeliverable', code: 131026, fbtrace_id: 'T' });

      await receive();

      const error = (await sendError().catch((e: unknown) => e)) as WhatsappProviderError;
      expect(error.constructor).toBe(WhatsappProviderError);
      expect(error.providerCode).toBe(131026);
      expect(reply()?.deliveryStatus).toBe('failed');
    });

    it('500 con JSON de error: error genérico, un solo intento (sin reintentos)', async () => {
      testApp.graph.respondGraphError(url, 500, { message: 'An unknown error occurred', code: 2, fbtrace_id: 'T5' });

      await receive();

      const error = (await sendError().catch((e: unknown) => e)) as WhatsappProviderError;
      expect(error.constructor).toBe(WhatsappProviderError);
      expect(error.providerCode).toBe(2);
      expect(reply()?.deliveryStatus).toBe('failed');
      expect(testApp.graph.calls).toHaveLength(1);
    });

    it('503 con cuerpo HTML (no JSON): error genérico "sin detalle", no se rompe el parseo', async () => {
      testApp.graph.respondWithText(url, '<html>Service Unavailable</html>', 503);

      await receive();

      const error = (await sendError().catch((e: unknown) => e)) as WhatsappProviderError;
      expect(error.constructor).toBe(WhatsappProviderError);
      expect(error.providerCode).toBeNull();
      expect(error.message).toBe('Error sin detalle de la Graph API');
      expect(reply()?.deliveryStatus).toBe('failed');
      expect(testApp.graph.calls).toHaveLength(1);
    });

    it('el token de acceso nunca aparece en los logs, ni siquiera ante un error', async () => {
      testApp.graph.respondGraphError(url, 401, { message: 'token inválido', code: 190, fbtrace_id: 'T' });

      await receive();

      expect(allLogs()).not.toContain(GRAPH_ACCESS_TOKEN);
    });

    it('un fallo de envío no impide atender el siguiente mensaje del cliente', async () => {
      testApp.graph.respondGraphError(url, 500, { message: 'x', code: 2, fbtrace_id: 'T' }).respondJson(url, accepted);

      await receive('wamid.IN.1');
      await receive('wamid.IN.2');

      expect(testApp.messages.all().filter((m) => m.sender === MessageSender.AGENT).map((m) => m.deliveryStatus).sort()).toEqual([
        'failed',
        'sent',
      ]);
    });
  });

  describe('timeout y fallos de red (sin esperar los 10 s reales)', () => {
    it('timeout (AbortSignal.timeout rechaza con TimeoutError): WhatsappProviderTimeoutError, mensaje "failed", un solo intento', async () => {
      testApp.graph.respondRejecting(url, timeoutAbortError());

      await receive();

      await expect(sendError()).rejects.toBeInstanceOf(WhatsappProviderTimeoutError);
      expect(reply()).toMatchObject({ deliveryStatus: 'failed', providerMessageId: null });
      expect(allLogs()).toContain('Timeout de 10000 ms');
      expect(testApp.graph.calls).toHaveLength(1);
    });

    it('el cliente pasa una señal de aborto con el timeout de 10 s', async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
      testApp.graph.respondJson(url, accepted);

      await receive();

      expect(timeoutSpy).toHaveBeenCalledWith(10_000);
      timeoutSpy.mockRestore();
    });

    it('error de red genérico (TypeError: fetch failed): WhatsappProviderError sin filtrar detalles del error original', async () => {
      testApp.graph.respondRejecting(url, new TypeError(`fetch failed: ${url}?access_token=${GRAPH_ACCESS_TOKEN}`));

      await receive();

      const error = (await sendError().catch((e: unknown) => e)) as WhatsappProviderError;
      expect(error.constructor).toBe(WhatsappProviderError);
      expect(error.message).toBe('No se pudo contactar a la Graph API');
      expect(reply()?.deliveryStatus).toBe('failed');
      expect(allLogs()).not.toContain(GRAPH_ACCESS_TOKEN);
    });
  });

  describe('validación previa al envío', () => {
    it('respuesta del agente vacía o solo espacios: no se llama a la Graph API y el mensaje queda "failed"', async () => {
      testApp.agent.respondWith('   ');

      await receive();

      expect(testApp.graph.calls).toEqual([]);
      expect(reply()).toMatchObject({ deliveryStatus: 'failed', providerMessageId: null });
      await expect(sendError()).rejects.toThrow('Cuerpo de mensaje inválido');
    });

    it(`respuesta de más de ${MAX_MESSAGE_BODY_LENGTH} caracteres: no se llama a la Graph API (no se trunca ni se divide) y queda "failed"`, async () => {
      testApp.agent.respondWith('x'.repeat(MAX_MESSAGE_BODY_LENGTH + 1));

      await receive();

      expect(testApp.graph.calls).toEqual([]);
      expect(reply()?.deliveryStatus).toBe('failed');
    });

    it(`respuesta de exactamente ${MAX_MESSAGE_BODY_LENGTH} caracteres: se envía`, async () => {
      testApp.agent.respondWith('x'.repeat(MAX_MESSAGE_BODY_LENGTH));
      testApp.graph.respondJson(url, accepted);

      await receive();

      expect(testApp.graph.calls).toHaveLength(1);
      expect(reply()?.deliveryStatus).toBe('sent');
    });
  });

  it('con el plan inactivo no se llama a la Graph API', async () => {
    testApp.plan.setActive(BUSINESS_A, false);

    await receive();

    expect(testApp.graph.calls).toEqual([]);
  });
});
