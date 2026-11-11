import { Conversation, ConversationStatus } from './conversation.entity';

describe('Conversation.close', () => {
  const anActive = () =>
    Conversation.create({
      id: 'conversation-1',
      businessId: 'business-1',
      customerNumber: '+573001111111',
      status: ConversationStatus.ACTIVE,
      createdAt: new Date('2026-10-22T08:00:00.000Z'),
      updatedAt: new Date('2026-10-22T08:00:00.000Z'),
    });

  it('activa → cerrada: cambia el estado y actualiza updatedAt', () => {
    const conversation = anActive();
    const now = new Date('2026-10-22T12:00:00.000Z');

    conversation.close(now);

    expect(conversation.status).toBe(ConversationStatus.CLOSED);
    expect(conversation.updatedAt).toEqual(now);
  });

  it('es idempotente: cerrar una ya cerrada no hace nada ni cambia updatedAt', () => {
    const conversation = anActive();
    const firstClose = new Date('2026-10-22T12:00:00.000Z');
    conversation.close(firstClose);

    conversation.close(new Date('2026-10-22T20:00:00.000Z'));

    expect(conversation.status).toBe(ConversationStatus.CLOSED);
    expect(conversation.updatedAt).toEqual(firstClose);
  });

  it('start() crea la conversación activa', () => {
    const conversation = Conversation.start({ businessId: 'business-1', customerNumber: '+573001111111' });

    expect(conversation.status).toBe(ConversationStatus.ACTIVE);
  });
});
