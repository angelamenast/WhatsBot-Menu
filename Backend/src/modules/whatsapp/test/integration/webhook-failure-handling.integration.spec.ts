import { jest } from '@jest/globals';
import { MessageSender } from '../../domain/entities/message.entity';
import { messagesPayload, statusPayload, textPayload } from '../support/meta-payloads';
import { createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

/**
 * Comportamiento ACTUAL ante fallos: el webhook responde 200 de inmediato y procesa en segundo plano
 * (meta-webhook.controller.ts:61-75), así que ningún fallo posterior cambia la respuesta a Meta. No
 * hay reintento, cola ni persistencia del trabajo pendiente: un fallo deja el mensaje sin respuesta.
 */
describe('POST /api/whatsapp/webhook (fallos del agente, del envío y de la persistencia)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const byConversation = () => testApp.messages.all();

  describe('acuse inmediato', () => {
    it('responde 200 mientras el agente (fake) sigue pendiente; la respuesta se envía cuando termina', async () => {
      const held = testApp.agent.holdNext();

      // La petición HTTP termina aunque el despacho no haya terminado.
      await testApp.postWebhook(textPayload({ id: 'wamid.SLOW' })).expect(200);

      expect(testApp.agent.calls).toHaveLength(1);
      expect(testApp.messaging.calls).toEqual([]);
      expect(byConversation().map((m) => m.sender)).toEqual([MessageSender.CUSTOMER]);

      held.resolve('Respuesta tardía');
      await testApp.settle();

      expect(testApp.messaging.calls.map((call) => call.body)).toEqual(['Respuesta tardía']);
      expect(byConversation().map((m) => m.sender).sort()).toEqual([MessageSender.AGENT, MessageSender.CUSTOMER]);
    });

    it('el mensaje del cliente ya está guardado mientras el agente sigue pendiente', async () => {
      testApp.agent.holdNext();

      await testApp.postWebhook(textPayload({ id: 'wamid.SLOW', body: 'Hola' })).expect(200);

      expect(byConversation()).toHaveLength(1);
      expect(byConversation()[0].content).toBe('Hola');
    });
  });

  describe('falla el agente', () => {
    it('200; el mensaje del cliente queda guardado, no se envía nada y se registra el error', async () => {
      testApp.agent.failWith(new Error('LLM sin cuota'));

      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      expect(byConversation().map((m) => m.sender)).toEqual([MessageSender.CUSTOMER]);
      expect(testApp.messaging.calls).toEqual([]);
      expect(testApp.logs.error.join('\n')).toContain('Fallo al despachar al agente');
      expect(testApp.logs.error.join('\n')).toContain('LLM sin cuota');
    });

    it('un fallo del agente en un mensaje no impide procesar los siguientes del mismo POST', async () => {
      testApp.agent.respondWith('Respuesta al segundo');
      jest.spyOn(testApp.agent, 'dispatch').mockRejectedValueOnce(new Error('LLM caído'));

      await testApp
        .postWebhook(
          messagesPayload([
            { id: 'wamid.IN.1', body: 'primero' },
            { id: 'wamid.IN.2', body: 'segundo' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expect(testApp.messaging.calls.map((call) => call.body)).toEqual(['Respuesta al segundo']);
    });
  });

  describe('falla el envío', () => {
    it('200; la respuesta del agente se guarda con estado "failed" y sin wamid', async () => {
      testApp.messaging.failWith(new Error('Graph API caída'));

      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      const reply = byConversation().find((m) => m.sender === MessageSender.AGENT);
      expect(reply).toMatchObject({ content: 'Respuesta del agente', deliveryStatus: 'failed', providerMessageId: null });
      expect(testApp.logs.error.join('\n')).toContain('Graph API caída');
    });

    it('no hay reintento del envío: un solo intento por respuesta', async () => {
      testApp.messaging.failWith(new Error('Graph API caída'));

      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      expect(testApp.messaging.calls).toHaveLength(1);
    });

    it('un fallo de envío no se propaga: el siguiente mensaje del cliente se atiende normalmente', async () => {
      testApp.messaging.failWith(new Error('Graph API caída'));
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      testApp.messaging.respondWith({ providerMessageId: 'wamid.OUT.OK', status: 'sent' });
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.2' })).expect(200);
      await testApp.settle();

      const replies = byConversation().filter((m) => m.sender === MessageSender.AGENT);
      expect(replies.map((m) => m.deliveryStatus)).toEqual(['failed', 'sent']);
    });
  });

  describe('falla la persistencia o el estado del plan', () => {
    it('si guardar el mensaje falla: 200, error registrado con el wamid y se sigue con el siguiente mensaje', async () => {
      jest.spyOn(testApp.messages, 'save').mockRejectedValueOnce(new Error('DB caída'));

      await testApp
        .postWebhook(
          messagesPayload([
            { id: 'wamid.IN.1', body: 'primero' },
            { id: 'wamid.IN.2', body: 'segundo' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expect(testApp.logs.error.join('\n')).toContain('Fallo procesando el mensaje wamid.IN.1');
      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['segundo']);
    });

    it('si falla la verificación de duplicado: 200 y el error queda registrado sin tocar al agente', async () => {
      jest.spyOn(testApp.processed, 'existsByProviderMessageId').mockRejectedValueOnce(new Error('DB caída'));

      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      expect(testApp.logs.error.join('\n')).toContain('wamid.IN.1');
      expect(testApp.agent.calls).toEqual([]);
      expect(byConversation()).toEqual([]);
    });

    it('si falla el procesamiento de un estado de entrega: 200 y el error queda registrado con el wamid; los demás estados se siguen aplicando', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.postWebhook(textPayload({ id: 'wamid.IN.2' })).expect(200);
      await testApp.settle();
      jest.spyOn(testApp.messages, 'findByProviderMessageId').mockRejectedValueOnce(new Error('DB caída'));

      await testApp
        .postWebhook(
          statusPayload([
            { id: 'wamid.OUT.1', status: 'failed' },
            { id: 'wamid.OUT.2', status: 'failed' },
          ]),
        )
        .expect(200);
      await testApp.settle();

      expect(testApp.logs.error.join('\n')).toContain('Fallo procesando el estado del mensaje wamid.OUT.1');
      const delivery = (wamid: string) => byConversation().find((m) => m.providerMessageId === wamid)?.deliveryStatus;
      expect([delivery('wamid.OUT.1'), delivery('wamid.OUT.2')]).toEqual(['sent', 'failed']);
    });

    it('si falla la consulta del plan: 200; el mensaje ya quedó guardado, no se llama al agente y se registra el error', async () => {
      testApp.plan.failWith(new Error('Suscripciones caído'));

      await testApp.postWebhook(textPayload({ id: 'wamid.IN.1' })).expect(200);
      await testApp.settle();

      expect(byConversation().map((m) => m.sender)).toEqual([MessageSender.CUSTOMER]);
      expect(testApp.agent.calls).toEqual([]);
      expect(testApp.logs.error.join('\n')).toContain('Suscripciones caído');
    });

    it('el mensaje fallido no se reintenta solo (no hay cola): la misma entrega repetida por Meta tampoco lo recupera si ya se guardó', async () => {
      testApp.plan.failWith(new Error('Suscripciones caído'));
      const payload = textPayload({ id: 'wamid.IN.1' });
      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      testApp.plan.failWith(null);
      await testApp.postWebhook(payload).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls).toEqual([]);
      expect(testApp.messaging.calls).toEqual([]);
    });
  });
});
