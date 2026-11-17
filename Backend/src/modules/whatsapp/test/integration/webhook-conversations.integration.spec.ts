import { jest } from '@jest/globals';
import { CONVERSATION_INACTIVITY_MS } from '../../application/constants/conversation-lifecycle';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { MessageSender } from '../../domain/entities/message.entity';
import { Barrier } from '../support/async-helpers';
import { DEFAULT_CUSTOMER, DEFAULT_PHONE_NUMBER_ID, textPayload } from '../support/meta-payloads';
import { BUSINESS_A, BUSINESS_B, PHONE_NUMBER_ID_B, createWhatsappTestApp } from '../support/whatsapp-test-app';
import type { WhatsappTestApp } from '../support/whatsapp-test-app';

describe('POST /api/whatsapp/webhook (conversaciones y plan)', () => {
  let testApp: WhatsappTestApp;

  beforeEach(async () => {
    testApp = await createWhatsappTestApp();
    await testApp.seedBusiness(BUSINESS_A, DEFAULT_PHONE_NUMBER_ID);
  });

  afterEach(async () => {
    await testApp.close();
  });

  describe('conversación nueva vs existente', () => {
    it('el primer mensaje de un cliente abre una conversación activa del negocio', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all()).toMatchObject([
        { businessId: BUSINESS_A, customerNumber: DEFAULT_CUSTOMER, status: ConversationStatus.ACTIVE },
      ]);
    });

    it('los mensajes siguientes del mismo cliente reutilizan la conversación activa', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'uno' })).expect(200);
      await testApp.settle();
      await testApp.postWebhook(textPayload({ id: 'wamid.2', body: 'dos' })).expect(200);
      await testApp.settle();

      const [conversation] = testApp.conversations.all();
      expect(testApp.conversations.all()).toHaveLength(1);
      expect(testApp.messages.byConversation(conversation.id)).toHaveLength(4);
      expect(testApp.agent.calls.map((c) => c.conversationId)).toEqual([conversation.id, conversation.id]);
    });

    it('un cliente distinto abre su propia conversación', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1', from: '573001111111' })).expect(200);
      await testApp.postWebhook(textPayload({ id: 'wamid.2', from: '573002222222' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all()).toHaveLength(2);
    });

    it('el mismo cliente en dos negocios tiene una conversación por negocio', async () => {
      await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);

      await testApp.postWebhook(textPayload({ id: 'wamid.A', phoneNumberId: DEFAULT_PHONE_NUMBER_ID })).expect(200);
      await testApp.postWebhook(textPayload({ id: 'wamid.B', phoneNumberId: PHONE_NUMBER_ID_B })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all().map((c) => c.businessId).sort()).toEqual([BUSINESS_A, BUSINESS_B].sort());
    });

    it('una conversación cerrada no se reutiliza: el mensaje abre una nueva', async () => {
      const closed = Conversation.start({ businessId: BUSINESS_A, customerNumber: DEFAULT_CUSTOMER });
      closed.close();
      await testApp.conversations.save(closed);

      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      const all = testApp.conversations.all();
      expect(all).toHaveLength(2);
      expect(all.find((c) => c.id === closed.id)?.status).toBe(ConversationStatus.CLOSED);
      expect(testApp.agent.calls[0].conversationId).not.toBe(closed.id);
    });
  });

  describe('inactividad (4 h, reloj controlado: solo se congela Date)', () => {
    const start = new Date('2026-01-15T10:00:00.000Z');

    beforeEach(() => {
      testApp.freezeClock(start);
    });

    it('a las 4 h exactas del último mensaje se cierra la conversación y el mensaje abre una nueva sin historial', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'viejo' })).expect(200);
      await testApp.settle();
      const [old] = testApp.conversations.all();

      testApp.advanceClock(CONVERSATION_INACTIVITY_MS);
      await testApp.postWebhook(textPayload({ id: 'wamid.2', body: 'nuevo' })).expect(200);
      await testApp.settle();

      const all = testApp.conversations.all();
      expect(all).toHaveLength(2);
      expect(all.find((c) => c.id === old.id)).toMatchObject({ status: ConversationStatus.CLOSED });
      const fresh = all.find((c) => c.id !== old.id);
      expect(fresh?.status).toBe(ConversationStatus.ACTIVE);
      expect(testApp.messages.byConversation(old.id).map((m) => m.content)).toEqual(['viejo', 'Respuesta del agente']);
      expect(testApp.messages.byConversation(fresh?.id as string).map((m) => m.content)).toEqual([
        'nuevo',
        'Respuesta del agente',
      ]);
      expect(testApp.agent.calls[1].conversationId).toBe(fresh?.id);
    });

    it('1 ms antes del límite todavía se reutiliza la conversación', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      testApp.advanceClock(CONVERSATION_INACTIVITY_MS - 1);
      await testApp.postWebhook(textPayload({ id: 'wamid.2' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all()).toHaveLength(1);
    });

    it('la inactividad se mide desde el ÚLTIMO mensaje (cualquier remitente), no desde la creación', async () => {
      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      testApp.advanceClock(CONVERSATION_INACTIVITY_MS - 60_000);
      await testApp.postWebhook(textPayload({ id: 'wamid.2' })).expect(200);
      await testApp.settle();

      testApp.advanceClock(CONVERSATION_INACTIVITY_MS - 60_000);
      await testApp.postWebhook(textPayload({ id: 'wamid.3' })).expect(200);
      await testApp.settle();

      // 8 h menos 2 min desde la creación, pero nunca 4 h entre mensajes consecutivos.
      expect(testApp.conversations.all()).toHaveLength(1);
    });

    it('una conversación activa sin mensajes usa su fecha de creación como última actividad', async () => {
      const stale = Conversation.create({
        id: 'conv-sin-mensajes',
        businessId: BUSINESS_A,
        customerNumber: DEFAULT_CUSTOMER,
        status: ConversationStatus.ACTIVE,
        createdAt: new Date(start.getTime() - CONVERSATION_INACTIVITY_MS),
        updatedAt: new Date(start.getTime() - CONVERSATION_INACTIVITY_MS),
      });
      await testApp.conversations.save(stale);

      await testApp.postWebhook(textPayload({ id: 'wamid.1' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all().find((c) => c.id === 'conv-sin-mensajes')?.status).toBe(ConversationStatus.CLOSED);
      expect(testApp.conversations.all()).toHaveLength(2);
    });
  });

  describe('plan inactivo (RF-25)', () => {
    it('guarda el mensaje, abre la conversación y NO despacha al agente ni envía respuesta', async () => {
      testApp.plan.setActive(BUSINESS_A, false);

      await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'Hola' })).expect(200);
      await testApp.settle();

      expect(testApp.conversations.all()).toHaveLength(1);
      expect(testApp.messages.all().map((m) => [m.sender, m.content])).toEqual([[MessageSender.CUSTOMER, 'Hola']]);
      expect(testApp.agent.calls).toEqual([]);
      expect(testApp.messaging.calls).toEqual([]);
    });

    it('el plan inactivo de un negocio no afecta a otro', async () => {
      await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);
      testApp.plan.setActive(BUSINESS_A, false);

      await testApp.postWebhook(textPayload({ id: 'wamid.A', phoneNumberId: DEFAULT_PHONE_NUMBER_ID })).expect(200);
      await testApp.postWebhook(textPayload({ id: 'wamid.B', phoneNumberId: PHONE_NUMBER_ID_B })).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.businessId)).toEqual([BUSINESS_B]);
    });

    it('al reactivarse el plan se responde a los mensajes nuevos, pero no se contestan los pendientes (no hay cola)', async () => {
      testApp.plan.setActive(BUSINESS_A, false);
      await testApp.postWebhook(textPayload({ id: 'wamid.1', body: 'sin respuesta' })).expect(200);
      await testApp.settle();

      testApp.plan.setActive(BUSINESS_A, true);
      await testApp.postWebhook(textPayload({ id: 'wamid.2', body: 'ahora sí' })).expect(200);
      await testApp.settle();

      expect(testApp.agent.calls.map((c) => c.message)).toEqual(['ahora sí']);
      expect(testApp.conversations.all()).toHaveLength(1);
    });
  });

  describe('mensajes concurrentes del mismo cliente (barrera determinista)', () => {
    it('dos mensajes a la vez sin conversación previa: la carrera se resuelve, una sola conversación y ambos se atienden', async () => {
      // Ambas peticiones leen "no hay conversación activa" antes de que cualquiera la cree.
      testApp.conversations.barriers.findActiveByBusinessAndCustomer = new Barrier(2);
      const saveSpy = jest.spyOn(testApp.conversations, 'save');

      const [first, second] = await Promise.all([
        testApp.postWebhook(textPayload({ id: 'wamid.C1', body: 'uno' })),
        testApp.postWebhook(textPayload({ id: 'wamid.C2', body: 'dos' })),
      ]);
      await testApp.settle();

      expect([first.status, second.status]).toEqual([200, 200]);
      // Prueba de que la carrera ocurrió: ambas intentaron crear y una chocó con uq_conversaciones_activa.
      const attempts = await Promise.allSettled(saveSpy.mock.results.map((result) => result.value as Promise<void>));
      expect(attempts.map((attempt) => attempt.status).sort()).toEqual(['fulfilled', 'rejected']);
      const [conversation] = testApp.conversations.all();
      expect(testApp.conversations.all()).toHaveLength(1);
      expect(testApp.messages.all().filter((m) => m.sender === MessageSender.CUSTOMER).map((m) => m.conversationId)).toEqual([
        conversation.id,
        conversation.id,
      ]);
      expect(testApp.agent.calls).toHaveLength(2);
      expect(testApp.messaging.calls).toHaveLength(2);
      // El conflicto de unicidad se absorbe (se relee la ganadora): no se registra ningún error.
      expect(testApp.logs.error).toEqual([]);
    });

    it('el índice único real habría fallado: sin el manejo del conflicto la segunda inserción lanza ActiveConversationAlreadyExistsError', async () => {
      const winner = Conversation.start({ businessId: BUSINESS_A, customerNumber: DEFAULT_CUSTOMER });
      await testApp.conversations.save(winner);
      const loser = Conversation.start({ businessId: BUSINESS_A, customerNumber: DEFAULT_CUSTOMER });

      await expect(testApp.conversations.save(loser)).rejects.toThrow('Ya existe una conversación activa');
    });

    it('dos mensajes a la vez en negocios distintos no interfieren', async () => {
      await testApp.seedBusiness(BUSINESS_B, PHONE_NUMBER_ID_B);
      testApp.conversations.barriers.findActiveByBusinessAndCustomer = new Barrier(2);

      await Promise.all([
        testApp.postWebhook(textPayload({ id: 'wamid.A', phoneNumberId: DEFAULT_PHONE_NUMBER_ID })),
        testApp.postWebhook(textPayload({ id: 'wamid.B', phoneNumberId: PHONE_NUMBER_ID_B })),
      ]);
      await testApp.settle();

      expect(testApp.conversations.all()).toHaveLength(2);
      expect(testApp.logs.error).toEqual([]);
    });

    it('mensajes concurrentes que cruzan el límite de inactividad: el cierre y la apertura no dejan dos activas', async () => {
      testApp.freezeClock(new Date('2026-01-15T10:00:00.000Z'));

      await testApp.postWebhook(textPayload({ id: 'wamid.0' })).expect(200);
      await testApp.settle();
      testApp.advanceClock(CONVERSATION_INACTIVITY_MS);

      await Promise.all([
        testApp.postWebhook(textPayload({ id: 'wamid.C1' })),
        testApp.postWebhook(textPayload({ id: 'wamid.C2' })),
      ]);
      await testApp.settle();

      const active = testApp.conversations.all().filter((c) => c.status === ConversationStatus.ACTIVE);
      expect(active).toHaveLength(1);
      expect(testApp.agent.calls).toHaveLength(3);
    });
  });
});
