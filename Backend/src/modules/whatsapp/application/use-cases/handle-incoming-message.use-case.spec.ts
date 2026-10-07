import { Logger } from '@nestjs/common';
import { HandleIncomingMessageUseCase } from './handle-incoming-message.use-case';
import { SendMessageUseCase } from './send-message.use-case';
import { WhatsappConnectionRepository } from '../../domain/repositories/whatsapp-connection.repository';
import { ProcessedMessageRepository } from '../../domain/repositories/processed-message.repository';
import { ConversationRepository } from '../../domain/repositories/conversation.repository';
import { MessageRepository } from '../../domain/repositories/message.repository';
import { PlanStatusPort } from '../ports/out/plan-status.port';
import { AgentDispatchPort } from '../ports/out/agent-dispatch.port';
import {
  WhatsappConnection,
  WhatsappConnectionStatus,
} from '../../domain/entities/whatsapp-connection.entity';
import { Conversation, ConversationStatus } from '../../domain/entities/conversation.entity';
import { WhatsappConnectionNotFoundError } from '../../domain/errors/whatsapp.errors';
import { HandleIncomingMessageCommand } from '../dto/handle-incoming-message.command';

describe('HandleIncomingMessageUseCase', () => {
  let whatsappConnectionRepository: jest.Mocked<WhatsappConnectionRepository>;
  let processedMessageRepository: jest.Mocked<ProcessedMessageRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let planStatusPort: jest.Mocked<PlanStatusPort>;
  let agentDispatchPort: jest.Mocked<AgentDispatchPort>;
  let sendMessageUseCase: { execute: jest.Mock };
  let errorSpy: jest.SpyInstance;
  let useCase: HandleIncomingMessageUseCase;

  const command: HandleIncomingMessageCommand = {
    toPhoneNumber: '+573000000000',
    fromCustomerNumber: '+573001111111',
    body: 'Hola, quiero ver el menú',
    providerMessageId: 'SM123456789',
  };

  const aConnection = () =>
    WhatsappConnection.create({
      id: 'connection-1',
      businessId: 'business-1',
      phoneNumber: command.toPhoneNumber,
      twilioSubaccountSid: 'AC123',
      twilioSenderSid: 'MG123',
      status: WhatsappConnectionStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  const anActiveConversation = () =>
    Conversation.create({
      id: 'conversation-1',
      businessId: 'business-1',
      customerNumber: command.fromCustomerNumber,
      status: ConversationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    whatsappConnectionRepository = {
      findByBusinessId: jest.fn(),
      findByPhoneNumber: jest.fn(),
      save: jest.fn(),
    };
    processedMessageRepository = {
      existsByProviderMessageId: jest.fn(),
    };
    conversationRepository = {
      findById: jest.fn(),
      findActiveByBusinessAndCustomer: jest.fn(),
      save: jest.fn(),
    };
    messageRepository = {
      save: jest.fn(),
      findByProviderMessageId: jest.fn(),
    };
    planStatusPort = {
      isActive: jest.fn(),
    };
    agentDispatchPort = {
      dispatch: jest.fn(),
    };
    sendMessageUseCase = { execute: jest.fn().mockResolvedValue(undefined) };

    agentDispatchPort.dispatch.mockResolvedValue({ responseText: 'Respuesta del agente' });
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    useCase = new HandleIncomingMessageUseCase(
      whatsappConnectionRepository,
      processedMessageRepository,
      conversationRepository,
      messageRepository,
      planStatusPort,
      agentDispatchPort,
      sendMessageUseCase as unknown as SendMessageUseCase,
    );
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('procesa un mensaje nuevo: crea conversación, persiste el mensaje y delega al agente si el plan está activo', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(null);
    planStatusPort.isActive.mockResolvedValue(true);

    await useCase.execute(command);

    expect(processedMessageRepository.existsByProviderMessageId).toHaveBeenCalledWith(
      command.providerMessageId,
    );
    expect(whatsappConnectionRepository.findByPhoneNumber).toHaveBeenCalledWith(command.toPhoneNumber);
    expect(conversationRepository.findActiveByBusinessAndCustomer).toHaveBeenCalledWith(
      'business-1',
      command.fromCustomerNumber,
    );

    expect(conversationRepository.save).toHaveBeenCalledTimes(1);
    const savedConversation = conversationRepository.save.mock.calls[0][0];
    expect(savedConversation.businessId).toBe('business-1');
    expect(savedConversation.customerNumber).toBe(command.fromCustomerNumber);
    expect(savedConversation.status).toBe(ConversationStatus.ACTIVE);

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.conversationId).toBe(savedConversation.id);
    expect(savedMessage.content).toBe(command.body);
    expect(savedMessage.providerMessageId).toBe(command.providerMessageId);

    expect(planStatusPort.isActive).toHaveBeenCalledWith('business-1');
    expect(agentDispatchPort.dispatch).toHaveBeenCalledWith({
      businessId: 'business-1',
      conversationId: savedConversation.id,
      customerNumber: command.fromCustomerNumber,
      message: command.body,
    });
    expect(sendMessageUseCase.execute).toHaveBeenCalledWith({
      conversationId: savedConversation.id,
      body: 'Respuesta del agente',
    });
  });

  it('reutiliza la conversación activa existente en lugar de crear una nueva', async () => {
    const existingConversation = anActiveConversation();

    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(existingConversation);
    planStatusPort.isActive.mockResolvedValue(true);

    await useCase.execute(command);

    expect(conversationRepository.save).not.toHaveBeenCalled();
    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    const savedMessage = messageRepository.save.mock.calls[0][0];
    expect(savedMessage.conversationId).toBe(existingConversation.id);
  });

  it('mensaje duplicado: no vuelve a persistir ni a delegar al agente', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(true);

    await useCase.execute(command);

    expect(whatsappConnectionRepository.findByPhoneNumber).not.toHaveBeenCalled();
    expect(conversationRepository.findActiveByBusinessAndCustomer).not.toHaveBeenCalled();
    expect(conversationRepository.save).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
    expect(planStatusPort.isActive).not.toHaveBeenCalled();
    expect(agentDispatchPort.dispatch).not.toHaveBeenCalled();
  });

  it('negocio no encontrado: lanza WhatsappConnectionNotFoundError y no persiste nada', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(null);

    await expect(useCase.execute(command)).rejects.toThrow(WhatsappConnectionNotFoundError);

    expect(conversationRepository.findActiveByBusinessAndCustomer).not.toHaveBeenCalled();
    expect(conversationRepository.save).not.toHaveBeenCalled();
    expect(messageRepository.save).not.toHaveBeenCalled();
    expect(planStatusPort.isActive).not.toHaveBeenCalled();
    expect(agentDispatchPort.dispatch).not.toHaveBeenCalled();
  });

  it('plan vencido: registra el mensaje pero no delega al agente (RF-25)', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(anActiveConversation());
    planStatusPort.isActive.mockResolvedValue(false);

    await useCase.execute(command);

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(planStatusPort.isActive).toHaveBeenCalledWith('business-1');
    expect(agentDispatchPort.dispatch).not.toHaveBeenCalled();
    expect(sendMessageUseCase.execute).not.toHaveBeenCalled();
  });

  it('dispatch exitoso + envío falla: loguea, no propaga y el mensaje queda persistido', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(anActiveConversation());
    planStatusPort.isActive.mockResolvedValue(true);
    sendMessageUseCase.execute.mockRejectedValue(new Error('DB caída'));

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(sendMessageUseCase.execute).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('enviar la respuesta'));
  });

  it('dispatch falla: loguea, no propaga y no se llama a SendMessageUseCase', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(anActiveConversation());
    planStatusPort.isActive.mockResolvedValue(true);
    agentDispatchPort.dispatch.mockRejectedValue(new Error('agente caído'));

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(sendMessageUseCase.execute).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('despachar al agente'));
  });
});
