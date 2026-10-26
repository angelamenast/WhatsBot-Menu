import { jest } from '@jest/globals';
import { CloseConversationUseCase } from './close-conversation.use-case';
import { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';

describe('CloseConversationUseCase', () => {
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let useCase: CloseConversationUseCase;

  const aConversation = (status: ConversationStatus) =>
    Conversation.create({
      id: 'conversation-1',
      businessId: 'business-1',
      customerNumber: '+573001111111',
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    conversationRepository = {
      findById: jest.fn(),
      findActiveByBusinessAndCustomer: jest.fn(),
      save: jest.fn(),
    };
    useCase = new CloseConversationUseCase(conversationRepository);
  });

  it('cierra una conversación activa y la persiste', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation(ConversationStatus.ACTIVE));

    await useCase.execute('conversation-1');

    expect(conversationRepository.save).toHaveBeenCalledTimes(1);
    expect(conversationRepository.save.mock.calls[0][0].status).toBe(ConversationStatus.CLOSED);
  });

  it('idempotente: una conversación ya cerrada no se vuelve a escribir', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation(ConversationStatus.CLOSED));

    await expect(useCase.execute('conversation-1')).resolves.toBeUndefined();

    expect(conversationRepository.save).not.toHaveBeenCalled();
  });

  it('si no existe, lanza ConversationNotFoundError', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('conversation-1')).rejects.toThrow(ConversationNotFoundError);

    expect(conversationRepository.save).not.toHaveBeenCalled();
  });
});
