import { SendMessageUseCase } from './send-message.use-case';
import { MessagingPort } from '../ports/out/messaging.port';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { MessageSender } from '../../domain/entities/message.entity';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';
import { SendMessageCommand } from '../dto/send-message.command';

describe('SendMessageUseCase', () => {
  let messagingPort: jest.Mocked<MessagingPort>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let useCase: SendMessageUseCase;

  const command: SendMessageCommand = {
    conversationId: 'conversation-1',
    body: 'Tu pedido está listo para confirmar',
  };

  const aConversation = () =>
    Conversation.create({
      id: command.conversationId,
      businessId: 'business-1',
      customerNumber: '+573001111111',
      status: ConversationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    messagingPort = {
      sendMessage: jest.fn(),
    };
    messageRepository = {
      save: jest.fn(),
      findByProviderMessageId: jest.fn(),
    };
    conversationRepository = {
      findById: jest.fn(),
      findActiveByBusinessAndCustomer: jest.fn(),
      save: jest.fn(),
    };

    useCase = new SendMessageUseCase(messagingPort, messageRepository, conversationRepository);
  });

  it('envío exitoso: resuelve el número por conversationId y persiste el mensaje del agente', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockResolvedValue({
      providerMessageId: 'SM111',
      status: 'sent',
    });

    await useCase.execute(command);

    expect(conversationRepository.findById).toHaveBeenCalledWith(command.conversationId);
    expect(messagingPort.sendMessage).toHaveBeenCalledWith('+573001111111', command.body);
    expect(messageRepository.save).toHaveBeenCalledTimes(1);

    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
    expect(savedMessage.conversationId).toBe(command.conversationId);
    expect(savedMessage.content).toBe(command.body);
    expect(savedMessage.providerMessageId).toBe('SM111');
    expect(savedMessage.deliveryStatus).toBe('sent');
  });

  it('envío fallido: el provider responde status "failed" y se persiste igual, sin lanzar', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockResolvedValue({
      providerMessageId: 'SM222',
      status: 'failed',
    });

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.providerMessageId).toBe('SM222');
    expect(savedMessage.deliveryStatus).toBe('failed');
  });

  it('el provider lanza una excepción: se captura, se persiste como failed sin providerMessageId, y no se propaga', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockRejectedValue(new Error('Twilio timeout'));

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
    expect(savedMessage.content).toBe(command.body);
    expect(savedMessage.providerMessageId).toBeNull();
    expect(savedMessage.deliveryStatus).toBe('failed');
  });

  it('conversationId inexistente: lanza ConversationNotFoundError y no envía ni persiste nada', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(ConversationNotFoundError);

    expect(messagingPort.sendMessage).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
