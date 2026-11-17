import { MessageSender } from '../../domain/entities/message.entity';
import { Barrier } from '../support/async-helpers';
import { DEFAULT_PHONE_NUMBER_ID, messagesPayload, textPayload } from '../support/meta-payloads';
import { BUSINESS_A, BUSINESS_B, PHONE_NUMBER_ID_B, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * Meta reintenta un webhook si no recibe 200 a tiempo. La deduplicación consulta `mensajes` por
 * `id_mensaje_proveedor` (wamid) antes de tocar conversación, mensaje o agente.
 */
describe('POST /api/whatsapp/webhook (idempotencia ante reintentos)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
  });

  afterEach(async () => {
    await testApp.close();
  });

  const customerMessages = () => testApp.messages.all().filter((m) => m.sender === MessageSender.CUSTOMER);

  it('el mismo wamid reenviado no se reprocesa: un mensaje, una conversación, un despacho y una respuesta', async () => {
    const payload = textPayload({ id: 'wamid.RETRY', body: 'Hola' });

    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();
    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    expect(customerMessages()).toHaveLength(1);
    expect(testApp.conversations.all()).toHaveLength(1);
    expect(testApp.agent.calls).toHaveLength(1);
    expect(testApp.messaging.calls).toHaveLength(1);
    expect(testApp.logs.error).toEqual([]);
  });

  it('un reintento tardío tras varios mensajes nuevos también se ignora', async () => {
    await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'uno' })).expect(200);
    await testApp.postWebhook(textPayload({ id: 'wamid.2', body: 'dos' })).expect(200);
    await testApp.settle();

    await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'uno' })).expect(200);
    await testApp.settle();

    expect(customerMessages().map((m) => m.providerMessageId).sort()).toEqual(['wamid.1', 'wamid.2']);
    expect(testApp.agent.calls).toHaveLength(2);
  });

  it('el mismo wamid dos veces dentro del mismo POST: se procesa una sola vez', async () => {
    await testApp
      .postWebhook(
        messagesPayload([
          { id: 'wamid.DUP', body: 'repetido' },
          { id: 'wamid.DUP', body: 'repetido' },
        ]),
      )
      .expect(200);
    await testApp.settle();

    expect(customerMessages()).toHaveLength(1);
    expect(testApp.agent.calls).toHaveLength(1);
  });

  it('con el plan inactivo el reintento tampoco duplica el mensaje', async () => {
    testApp.plan.setActive(BUSINESS_A, false);
    const payload = textPayload({ id: 'wamid.RETRY', body: 'Hola' });

    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();
    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    expect(customerMessages()).toHaveLength(1);
    expect(testApp.agent.calls).toEqual([]);
  });

  it('si el agente falló, el reintento NO reintenta al agente: el mensaje queda sin respuesta (comportamiento actual)', async () => {
    testApp.agent.failWith(new Error('LLM caído'));
    const payload = textPayload({ id: 'wamid.RETRY', body: 'Hola' });

    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    testApp.agent.respondWith('Ahora sí respondo');
    await testApp.postWebhook(payload).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls).toHaveLength(1);
    expect(testApp.messaging.calls).toEqual([]);
    expect(customerMessages()).toHaveLength(1);
  });

  it('la deduplicación es global por wamid: el mismo id recibido por otro negocio se ignora', async () => {
    await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);

    await testApp.postWebhook(textPayload({ id: 'wamid.SAME', phoneNumberId: DEFAULT_PHONE_NUMBER_ID })).expect(200);
    await testApp.settle();
    await testApp.postWebhook(textPayload({ id: 'wamid.SAME', phoneNumberId: PHONE_NUMBER_ID_B })).expect(200);
    await testApp.settle();

    expect(testApp.agent.calls.map((c) => c.businessId)).toEqual([BUSINESS_A]);
  });

  it('wamid distintos del mismo cliente con el mismo texto NO son duplicados', async () => {
    await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'hola' })).expect(200);
    await testApp.postWebhook(textPayload({ id: 'wamid.2', body: 'hola' })).expect(200);
    await testApp.settle();

    expect(customerMessages()).toHaveLength(2);
    expect(testApp.agent.calls).toHaveLength(2);
  });

  describe('carrera: dos POST del mismo wamid a la vez (barrera determinista)', () => {
    it('ambos pasan la verificación de duplicado, pero solo se persiste un mensaje y hay un solo despacho al agente', async () => {
      // Ambas peticiones leen "no procesado" antes de que cualquiera escriba.
      testApp.processed.barriers.existsByProviderMessageId = new Barrier(2);
      const payload = textPayload({ id: 'wamid.RACE', body: 'Hola' });

      const [first, second] = await Promise.all([testApp.postWebhook(payload), testApp.postWebhook(payload)]);
      await testApp.settle();

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(customerMessages()).toHaveLength(1);
      expect(testApp.conversations.all()).toHaveLength(1);
      // Si esto fuera 2, habría doble respuesta al cliente: [BUG-CONOCIDO].
      expect(testApp.agent.calls).toHaveLength(1);
      expect(testApp.messaging.calls).toHaveLength(1);
    });

    it('la petición perdedora falla en la restricción única (mensajes_id_mensaje_proveedor_key) y se registra como error, no como duplicado', async () => {
      testApp.processed.barriers.existsByProviderMessageId = new Barrier(2);
      const payload = textPayload({ id: 'wamid.RACE', body: 'Hola' });

      await Promise.all([testApp.postWebhook(payload), testApp.postWebhook(payload)]);
      await testApp.settle();

      // Gap: la red de seguridad es la BD; el use case no distingue el 23505 de un fallo real.
      expect(testApp.logs.error).toHaveLength(1);
      expect(testApp.logs.error[0]).toContain('wamid.RACE');
      expect(testApp.logs.error[0]).toContain('mensajes_id_mensaje_proveedor_key');
    });
  });
});
