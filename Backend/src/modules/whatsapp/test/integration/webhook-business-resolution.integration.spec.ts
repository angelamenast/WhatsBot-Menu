import { WhatsappConnection, WhatsappConnectionStatus } from '../../domain/entities/whatsapp-connection.entity';
import { DEFAULT_CUSTOMER, DEFAULT_PHONE_NUMBER_ID, messagesChange, textPayload, webhookPayload } from '../support/meta-payloads';
import { BUSINESS_A, BUSINESS_B, PHONE_NUMBER_ID_B, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * El negocio se resuelve SOLO por `metadata.phone_number_id` (parser: meta-webhook.parser.ts:74;
 * use case: handle-incoming-message.use-case.ts:56). No se usa `display_phone_number`.
 */
describe('POST /api/whatsapp/webhook (identificación del negocio)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('enruta cada mensaje al negocio dueño del phone_number_id y responde desde ese mismo número', async () => {
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
    await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);

    await testApp.postWebhook(textPayload({ id: 'wamid.A', phoneNumberId: DEFAULT_PHONE_NUMBER_ID })).expect(200);
    await testApp.postWebhook(textPayload({ id: 'wamid.B', phoneNumberId: PHONE_NUMBER_ID_B })).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls.map((c) => c.businessId)).toEqual([BUSINESS_A, BUSINESS_B]);
    expect(testApp.messaging.calls.map((c) => c.phoneNumberId)).toEqual([DEFAULT_PHONE_NUMBER_ID, PHONE_NUMBER_ID_B]);
  });

  it('phone_number_id desconocido: 200, no se persiste nada, no se llama al agente y se avisa solo con el wamid', async () => {
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);

    await testApp.postWebhook(textPayload({ id: 'wamid.LOST', phoneNumberId: '999999999999999', body: 'texto privado' })).expect(200);
    await testApp.settle();

    expect(testApp.messages.all()).toEqual([]);
    expect(testApp.conversations.all()).toEqual([]);
    expect(testApp.agent.calls).toEqual([]);
    const warnings = testApp.logs.warn.join('\n');
    expect(warnings).toContain('wamid.LOST');
    expect(warnings).not.toContain(DEFAULT_CUSTOMER);
    expect(warnings).not.toContain('texto privado');
    expect(warnings).not.toContain('999999999999999');
    expect(testApp.logs.error).toEqual([]);
  });

  it('sin ninguna conexión registrada (base vacía): 200 y nada se procesa', async () => {
    await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls).toEqual([]);
    expect(testApp.messages.all()).toEqual([]);
  });

  it('un número desconocido en un POST no impide procesar los mensajes de números conocidos', async () => {
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
    const payload = webhookPayload(
      messagesChange({
        phoneNumberId: '999999999999999',
        messages: [{ from: DEFAULT_CUSTOMER, id: 'wamid.LOST', type: 'text', text: { body: 'perdido' } }],
      }),
      messagesChange({
        phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
        messages: [{ from: DEFAULT_CUSTOMER, id: 'wamid.OK', type: 'text', text: { body: 'bueno' } }],
      }),
    );

    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls.map((c) => c.message)).toEqual(['bueno']);
  });

  it('se identifica por phone_number_id y NO por display_phone_number: un número visible conocido con id desconocido no enruta', async () => {
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
    const known = testApp.connections.all()[0];
    const payload = webhookPayload({
      field: 'messages',
      value: {
        metadata: { display_phone_number: known.phoneNumber, phone_number_id: 'otro-id' },
        messages: [{ from: DEFAULT_CUSTOMER, id: 'wamid.1', type: 'text', text: { body: 'hola' } }],
      },
    });

    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls).toEqual([]);
  });

  describe('un mismo número de prueba para varios negocios', () => {
    it('no es posible: phone_number_id es único (conexiones_whatsapp_phone_number_id_key); el segundo negocio no se vincula y el enrutamiento sigue siendo del primero', async () => {
      await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);

      await expect(testApp.seedBusiness(BUSINESS_B, DEFAULT_PHONE_NUMBER_ID)).rejects.toMatchObject({
        code: '23505',
        constraint: 'conexiones_whatsapp_phone_number_id_key',
      });

      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.businessId)).toEqual([BUSINESS_A]);
      expect(testApp.connections.all()).toHaveLength(1);
    });

    it('volver a vincular el mismo negocio a otro número deja de enrutar el número anterior', async () => {
      await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
      await testApp.seedBusiness(BUSINESS_A, PHONE_NUMBER_ID_B);

      await testApp
        .postWebhook(textPayload({ id: 'wamid.OLD', body: 'al número viejo', phoneNumberId: DEFAULT_PHONE_NUMBER_ID }))
        .expect(200);
      await testApp
        .postWebhook(textPayload({ id: 'wamid.NEW', body: 'al número nuevo', phoneNumberId: PHONE_NUMBER_ID_B }))
        .expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['al número nuevo']);
      expect(testApp.messaging.calls.map((c) => c.phoneNumberId)).toEqual([PHONE_NUMBER_ID_B]);
    });
  });

  describe('estado de la conexión', () => {
    it.each([WhatsappConnectionStatus.PENDING, WhatsappConnectionStatus.FAILED])(
      'conexión en estado %s: IGUAL se procesan los mensajes (el enrutamiento no mira el estado de la conexión)',
      async (status) => {
        const now = new Date();
        await testApp.connections.save(
          WhatsappConnection.create({
            id: 'conn-1',
            businessId: BUSINESS_A,
            phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
            wabaId: 'waba',
            phoneNumber: null,
            status,
            createdAt: now,
            updatedAt: now,
          }),
        );

        await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
        await testApp.settle();

        // Observación: handle-incoming-message.use-case.ts:56-60 solo comprueba que exista la fila.
        expect(testApp.agent.calls).toHaveLength(1);
      },
    );
  });
});
