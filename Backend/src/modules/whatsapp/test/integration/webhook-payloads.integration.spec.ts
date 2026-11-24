import { MessageSender } from '../../domain/entities/message.entity';
import {
  DEFAULT_CUSTOMER,
  DEFAULT_PHONE_NUMBER_ID,
  messagesChange,
  messagesPayload,
  rawMessagePayload,
  statusPayload,
  textPayload,
  webhookPayload,
} from '../support/meta-payloads';
import { BUSINESS_A, BUSINESS_B, PHONE_NUMBER_ID_B, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

describe('POST /api/whatsapp/webhook (contenido del payload)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
  });

  afterEach(async () => {
    await testApp.close();
  });

  const expectNothingProcessed = () => {
    expect(testApp.agent.calls).toEqual([]);
    expect(testApp.messaging.calls).toEqual([]);
    expect(testApp.messages.all()).toEqual([]);
    expect(testApp.conversations.all()).toEqual([]);
  };

  describe('mensaje de texto', () => {
    it('200, crea la conversación, guarda el mensaje del cliente, despacha al agente y envía la respuesta', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1', body: 'Quiero una pizza' })).expect(200);
      await testApp.settle();

      const [conversation] = testApp.conversations.all();
      expect(testApp.conversations.all()).toHaveLength(1);
      expect(conversation.businessId).toBe(BUSINESS_A);
      expect(conversation.customerNumber).toBe(DEFAULT_CUSTOMER);

      const stored = testApp.messages.byConversation(conversation.id);
      expect(stored.map((m) => [m.sender, m.content, m.providerMessageId, m.deliveryStatus])).toEqual([
        [MessageSender.CUSTOMER, 'Quiero una pizza', 'wamid.IN.1', null],
        [MessageSender.AGENT, 'Respuesta del agente', 'wamid.OUT.1', 'sent'],
      ]);

      expect(testApp.agent.calls).toEqual([
        {
          businessId: BUSINESS_A,
          conversationId: conversation.id,
          messageId: stored[0].id,
          customerNumber: DEFAULT_CUSTOMER,
          message: 'Quiero una pizza',
        },
      ]);
      expect(testApp.messaging.calls).toEqual([
        { phoneNumberId: DEFAULT_PHONE_NUMBER_ID, to: DEFAULT_CUSTOMER, body: 'Respuesta del agente' },
      ]);
    });

    it('el agente decide no responder (null): se guarda el mensaje y no se envía nada', async () => {
      testApp.agent.respondWith(null);

      await testApp.postWebhook(textPayload()).expect(200);
      await testApp.settle();

      expect(testApp.messages.all()).toHaveLength(1);
      expect(testApp.messaging.calls).toEqual([]);
    });

    it('conserva el texto tal cual (acentos, emoji, saltos de línea) hasta el agente', async () => {
      const body = 'Hola 👋\n¿Tienen café con leche?   ';

      await testApp.postWebhook(textPayload({ body })).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls[0].message).toBe(body);
    });

    it('un número con "+" y separadores se normaliza a dígitos', async () => {
      await testApp.postWebhook(textPayload({ from: '+57 300-111 1111' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all()[0].customerNumber).toBe('573001111111');
      expect(testApp.messaging.calls[0].to).toBe('573001111111');
    });

    // BUG: text.body vacío se acepta (meta-webhook.parser.ts:82-88 solo exige typeof string). Se persiste y se
    // despacha al agente (consumo de LLM/cuota) sin contenido. Comportamiento correcto esperado: ignorarlo.
    it.failing('[BUG-CONOCIDO] un texto vacío no debería despacharse al agente ni persistirse', async () => {
      await testApp.postWebhook(textPayload({ body: '' })).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls).toEqual([]);
      expect(testApp.messages.all()).toEqual([]);
    });
  });

  describe('tipos de mensaje no soportados', () => {
    it.each([
      ['image', { image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'foto privada' } }],
      ['audio', { audio: { id: 'media-2', mime_type: 'audio/ogg', voice: true } }],
      ['video', { video: { id: 'media-3' } }],
      ['document', { document: { id: 'media-4', filename: 'cedula.pdf' } }],
      ['sticker', { sticker: { id: 'media-5' } }],
      ['location', { location: { latitude: 4.6, longitude: -74.1 } }],
      ['contacts', { contacts: [{ name: { formatted_name: 'Alguien' } }] }],
      ['button', { button: { text: 'Sí', payload: 'yes' } }],
      ['interactive', { interactive: { type: 'button_reply', button_reply: { id: '1', title: 'Sí' } } }],
      ['reaction', { reaction: { message_id: 'wamid.X', emoji: '👍' } }],
      ['unsupported', { errors: [{ code: 131051, title: 'Unsupported message type' }] }],
    ])('%s: 200, no se procesa, no se persiste y el warning solo trae el tipo', async (type, content) => {
      await testApp
        .postWebhook(
          rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'wamid.NOTEXT', timestamp: '1700000000', type, ...content }),
        )
        .expect(200);
      await testApp.settle();

      expectNothingProcessed();
      const warnings = testApp.logs.warn.join('\n');
      expect(warnings).toContain(type);
      expect(warnings).not.toContain(DEFAULT_CUSTOMER);
      expect(warnings).not.toContain('foto privada');
      expect(warnings).not.toContain('cedula.pdf');
    });

    it('mensaje sin campo type: se descarta como "unknown"', async () => {
      await testApp.postWebhook(rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'wamid.NOTYPE' })).expect(200);
      await testApp.settle();

      expectNothingProcessed();
      expect(testApp.logs.warn.join('\n')).toContain('unknown');
    });

    it('texto + imagen en el mismo POST: solo se procesa el texto y el cliente no recibe respuesta por la imagen', async () => {
      const payload = webhookPayload(
        messagesChange({
          messages: [
            { from: DEFAULT_CUSTOMER, id: 'wamid.IMG', type: 'image', image: { id: 'm1' } },
            { from: DEFAULT_CUSTOMER, id: 'wamid.TXT', type: 'text', text: { body: 'Solo texto' } },
          ],
        }),
      );

      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['Solo texto']);
      expect(testApp.messages.all().filter((m) => m.sender === MessageSender.CUSTOMER)).toHaveLength(1);
    });
  });

  describe('payload solo con statuses', () => {
    it('no despacha al agente, no abre conversación ni envía nada', async () => {
      await testApp
        .postWebhook(
          statusPayload([
            { id: 'wamid.OUT.9', status: 'delivered' },
            { id: 'wamid.OUT.10', status: 'read' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expectNothingProcessed();
    });
  });

  describe('varios mensajes', () => {
    it('del mismo cliente en un entry: una sola conversación, se procesan en orden y cada uno se responde', async () => {
      await testApp
        .postWebhook(
          messagesPayload([
            { id: 'wamid.IN.1', body: 'primero' },
            { id: 'wamid.IN.2', body: 'segundo' },
            { id: 'wamid.IN.3', body: 'tercero' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['primero', 'segundo', 'tercero']);
      expect(testApp.conversations.all()).toHaveLength(1);
      expect(testApp.messaging.calls).toHaveLength(3);
      expect(testApp.messages.all()).toHaveLength(6);
    });

    it('de clientes distintos: una conversación por cliente', async () => {
      await testApp
        .postWebhook(
          messagesPayload([
            { id: 'wamid.IN.1', from: '573001111111' },
            { id: 'wamid.IN.2', from: '573002222222' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expect(testApp.conversations.all().map((c) => c.customerNumber).sort()).toEqual(['573001111111', '573002222222']);
    });

    it('varios entries/changes de negocios distintos: cada mensaje va a su negocio', async () => {
      await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);
      const payload = webhookPayload(
        messagesChange({
          phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
          messages: [{ from: '573001111111', id: 'wamid.IN.A', type: 'text', text: { body: 'para A' } }],
        }),
        messagesChange({
          phoneNumberId: PHONE_NUMBER_ID_B,
          messages: [{ from: '573001111111', id: 'wamid.IN.B', type: 'text', text: { body: 'para B' } }],
        }),
      );

      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => [c.businessId, c.message])).toEqual([
        [BUSINESS_A, 'para A'],
        [BUSINESS_B, 'para B'],
      ]);
    });

    it('mensajes y estados en el mismo POST: se procesan ambos', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      const payload = webhookPayload(
        messagesChange({
          messages: [{ from: DEFAULT_CUSTOMER, id: 'wamid.IN.2', type: 'text', text: { body: 'otro' } }],
          statuses: [{ id: 'wamid.OUT.1', status: 'delivered', recipient_id: DEFAULT_CUSTOMER }],
        }),
      );
      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls).toHaveLength(2);
    });
  });

  describe('estructura malformada o inesperada (con firma válida): 200 y no se procesa nada', () => {
    it.each([
      ['objeto vacío', {}],
      ['array en la raíz', []],
      ['entry no es un array', { entry: 'x' }],
      ['entry con elementos que no son objetos', { entry: [1, 'a', null] }],
      ['changes ausente', { entry: [{ id: '1' }] }],
      ['changes no es un array', { entry: [{ changes: {} }] }],
      ['field distinto de "messages"', { entry: [{ changes: [{ field: 'account_update', value: {} }] }] }],
      ['value ausente', { entry: [{ changes: [{ field: 'messages' }] }] }],
      ['value no es un objeto', { entry: [{ changes: [{ field: 'messages', value: 'x' }] }] }],
      ['messages no es un array', { entry: [{ changes: [{ field: 'messages', value: { messages: 'x' } }] }] }],
      [
        'mensaje sin metadata.phone_number_id',
        {
          entry: [
            {
              changes: [
                { field: 'messages', value: { messages: [{ from: DEFAULT_CUSTOMER, id: 'w1', type: 'text', text: { body: 'hola' } }] } },
              ],
            },
          ],
        },
      ],
      ['phone_number_id numérico en vez de texto', rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'w2', type: 'text', text: { body: 'hola' } }, 123 as unknown as string)],
      ['mensaje sin id', rawMessagePayload({ from: DEFAULT_CUSTOMER, type: 'text', text: { body: 'hola' } })],
      ['mensaje sin from', rawMessagePayload({ id: 'w3', type: 'text', text: { body: 'hola' } })],
      ['text sin body', rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'w4', type: 'text', text: {} })],
      ['text.body numérico', rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'w5', type: 'text', text: { body: 42 } })],
      ['text ausente', rawMessagePayload({ from: DEFAULT_CUSTOMER, id: 'w6', type: 'text' })],
    ])('%s', async (_label, payload) => {
      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expectNothingProcessed();
    });

    it('un elemento válido junto a uno malformado: solo se procesa el válido', async () => {
      const payload = webhookPayload(
        messagesChange({
          messages: [
            { from: DEFAULT_CUSTOMER, id: 'wamid.BAD', type: 'text', text: {} },
            { from: DEFAULT_CUSTOMER, id: 'wamid.OK', type: 'text', text: { body: 'válido' } },
          ],
        }),
      );

      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['válido']);
    });

    it('el campo "object" no se valida: un payload bien formado se procesa aunque no diga whatsapp_business_account', async () => {
      const payload = { ...textPayload(), object: 'page' };

      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls).toHaveLength(1);
    });

    it('campos desconocidos y contacts ausentes no rompen el procesamiento', async () => {
      const payload = webhookPayload({
        field: 'messages',
        value: {
          metadata: { phone_number_id: DEFAULT_PHONE_NUMBER_ID, algo_nuevo: true },
          campo_futuro: { x: 1 },
          messages: [{ from: DEFAULT_CUSTOMER, id: 'wamid.IN.1', type: 'text', text: { body: 'hola' }, context: { id: 'x' } }],
        },
      });

      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls).toHaveLength(1);
    });
  });
});
