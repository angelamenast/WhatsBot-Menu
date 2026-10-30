import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SendMessageUseCase } from './send-message.use-case';
import { MessagingPort } from '../ports/out/messaging.port';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { MessageSender } from '../../domain/entities/message.entity';
import { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';
import { ConversationNotFoundError } from '../../domain/errors/whatsapp.errors';
import { SendMessageCommand } from '../dto/send-message.command';

describe('SendMessageUseCase', () => {
  let messagingPort: jest.Mocked<MessagingPort>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let whatsappConnectionRepository: jest.Mocked<WhatsappConnectionRepository>;
  let useCase: SendMessageUseCase;

  const command: SendMessageCommand = {
    conversationId: 'conversation-1',
    body: 'Tu pedido está listo para confirmar',
  };

  const aConversation = () =>
    Conversation.create({
      id: command.conversationId,
      businessId: 'business-1',
      customerNumber: '573001111111',
      status: ConversationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  const aConnection = () =>
    WhatsappConnection.create({
      id: 'connection-1',
      businessId: 'business-1',
      phoneNumberId: '106540352242922',
      wabaId: '102290129340398',
      phoneNumber: '15550253483',
      status: WhatsappConnectionStatus.CONNECTED,
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
      findLastMessageDate: jest.fn(),
    };
    conversationRepository = {
      findById: jest.fn(),
      findActiveByBusinessAndCustomer: jest.fn(),
      save: jest.fn(),
    };

    whatsappConnectionRepository = {
      findByBusinessId: jest.fn(),
      findByPhoneNumber: jest.fn(),
      findByPhoneNumberId: jest.fn(),
      save: jest.fn(),
    };
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(aConnection());

    useCase = new SendMessageUseCase(
      messagingPort,
      messageRepository,
      conversationRepository,
      whatsappConnectionRepository,
    );
  });

  it('envío exitoso: resuelve número y phone_number_id desde la conversación y su conexión, y persiste el mensaje del agente', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockResolvedValue({
      providerMessageId: 'wamid.111',
      status: 'sent',
    });

    await useCase.execute(command);

    expect(conversationRepository.findById).toHaveBeenCalledWith(command.conversationId);
    expect(whatsappConnectionRepository.findByBusinessId).toHaveBeenCalledWith('business-1');
    expect(messagingPort.sendMessage).toHaveBeenCalledWith({
      phoneNumberId: '106540352242922',
      to: '573001111111',
      body: command.body,
    });
    expect(messageRepository.save).toHaveBeenCalledTimes(1);

    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
    expect(savedMessage.conversationId).toBe(command.conversationId);
    expect(savedMessage.content).toBe(command.body);
    expect(savedMessage.providerMessageId).toBe('wamid.111');
    expect(savedMessage.deliveryStatus).toBe('sent');
  });

  it('envío fallido: el provider responde status "failed" y se persiste igual, sin lanzar', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockResolvedValue({
      providerMessageId: 'wamid.222',
      status: 'failed',
    });

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.providerMessageId).toBe('wamid.222');
    expect(savedMessage.deliveryStatus).toBe('failed');
  });

  it('el provider lanza una excepción: se captura, se persiste como failed sin providerMessageId, y no se propaga', async () => {
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockRejectedValue(new Error('Graph API timeout'));

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.sender).toBe(MessageSender.AGENT);
    expect(savedMessage.content).toBe(command.body);
    expect(savedMessage.providerMessageId).toBeNull();
    expect(savedMessage.deliveryStatus).toBe('failed');
  });

  it('el log del fallo de envío identifica la conversación y NO contiene el número ni el cuerpo', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    conversationRepository.findById.mockResolvedValue(aConversation());
    messagingPort.sendMessage.mockRejectedValue(new Error('Graph API timeout'));

    await useCase.execute(command);

    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toContain(command.conversationId);
    expect(logged).toContain('Graph API timeout');
    expect(logged).not.toContain('573001111111');
    expect(logged).not.toContain(command.body);

    errorSpy.mockRestore();
  });

  it('el negocio no tiene conexión: se persiste como failed sin llamar al proveedor ni propagar', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    conversationRepository.findById.mockResolvedValue(aConversation());
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messagingPort.sendMessage).not.toHaveBeenCalled();
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.providerMessageId).toBeNull();
    expect(savedMessage.deliveryStatus).toBe('failed');
    expect(errorSpy.mock.calls.join(' ')).toContain('business-1');

    errorSpy.mockRestore();
  });

  it('conversationId inexistente: lanza ConversationNotFoundError y no envía ni persiste nada', async () => {
    conversationRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(ConversationNotFoundError);

    expect(messagingPort.sendMessage).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
