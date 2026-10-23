import { jest } from '@jest/globals';
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
import {
  ActiveConversationAlreadyExistsError,
  WhatsappConnectionNotFoundError,
} from '../../domain/errors/whatsapp.errors';
import { CONVERSATION_INACTIVITY_MS } from '../constants/conversation-lifecycle';
import { HandleIncomingMessageCommand } from '../dto/handle-incoming-message.command';

describe('HandleIncomingMessageUseCase', () => {
  let whatsappConnectionRepository: jest.Mocked<WhatsappConnectionRepository>;
  let processedMessageRepository: jest.Mocked<ProcessedMessageRepository>;
  let conversationRepository: jest.Mocked<ConversationRepository>;
  let messageRepository: jest.Mocked<MessageRepository>;
  let planStatusPort: jest.Mocked<PlanStatusPort>;
  let agentDispatchPort: jest.Mocked<AgentDispatchPort>;
  let sendMessageUseCase: { execute: jest.Mock<(...args: any[]) => any> };
  let errorSpy: ReturnType<typeof jest.spyOn>;
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
      findLastMessageDate: jest.fn(),
    };
    messageRepository.findLastMessageDate.mockResolvedValue(null);
    planStatusPort = {
      isActive: jest.fn(),
    };
    agentDispatchPort = {
      dispatch: jest.fn(),
    };
    sendMessageUseCase = {
      execute: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };

    agentDispatchPort.dispatch.mockResolvedValue('Respuesta del agente');
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
      messageId: savedMessage.id,
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

  it('el agente decide no responder (null): el mensaje queda persistido y no se envía nada', async () => {
    processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
    whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
    conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(anActiveConversation());
    planStatusPort.isActive.mockResolvedValue(true);
    agentDispatchPort.dispatch.mockResolvedValue(null);

    await expect(useCase.execute(command)).resolves.toBeUndefined();

    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(agentDispatchPort.dispatch).toHaveBeenCalledTimes(1);
    expect(sendMessageUseCase.execute).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
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

  describe('ciclo de vida de la conversación', () => {
    const now = new Date('2026-10-22T12:00:00.000Z');
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const HOUR = 60 * 60 * 1000;

    const anActiveConversationCreatedAt = (createdAt: Date) =>
      Conversation.create({
        id: 'conversation-old',
        businessId: 'business-1',
        customerNumber: command.fromCustomerNumber,
        status: ConversationStatus.ACTIVE,
        createdAt,
        updatedAt: createdAt,
      });

    beforeEach(() => {
      processedMessageRepository.existsByProviderMessageId.mockResolvedValue(false);
      whatsappConnectionRepository.findByPhoneNumber.mockResolvedValue(aConnection());
      planStatusPort.isActive.mockResolvedValue(true);
    });

    it('la constante de inactividad es de 4 horas', () => {
      expect(CONVERSATION_INACTIVITY_MS).toBe(4 * HOUR);
    });

    it('conversación vigente (menos de 4 h desde el último mensaje): se reutiliza, con una sola lectura y sin escrituras extra', async () => {
      const existing = anActiveConversationCreatedAt(ago(10 * HOUR));
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(existing);
      messageRepository.findLastMessageDate.mockResolvedValue(new Date(now.getTime() - (4 * HOUR - 1)));

      await useCase.execute(command, now);

      expect(messageRepository.findLastMessageDate).toHaveBeenCalledTimes(1);
      expect(messageRepository.findLastMessageDate).toHaveBeenCalledWith('conversation-old');
      expect(conversationRepository.save).not.toHaveBeenCalled();
      expect(messageRepository.save.mock.calls[0][0].conversationId).toBe('conversation-old');
    });

    it.each([
      ['justo en el límite de 4 h', 4 * HOUR],
      ['pasado el límite', 4 * HOUR + 1],
      ['muy pasado', 30 * HOUR],
    ])('%s: cierra la conversación y el mensaje abre una nueva', async (_label, elapsed) => {
      const existing = anActiveConversationCreatedAt(ago(40 * HOUR));
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(existing);
      messageRepository.findLastMessageDate.mockResolvedValue(ago(elapsed));

      await useCase.execute(command, now);

      expect(conversationRepository.save).toHaveBeenCalledTimes(2);
      const closed = conversationRepository.save.mock.calls[0][0];
      const opened = conversationRepository.save.mock.calls[1][0];
      expect(closed.id).toBe('conversation-old');
      expect(closed.status).toBe(ConversationStatus.CLOSED);
      expect(opened.id).not.toBe('conversation-old');
      expect(opened.status).toBe(ConversationStatus.ACTIVE);
      expect(messageRepository.save.mock.calls[0][0].conversationId).toBe(opened.id);
      expect(agentDispatchPort.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: opened.id }),
      );
    });

    it('sin mensajes usa la fecha de creación de la conversación (vigente)', async () => {
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(
        anActiveConversationCreatedAt(ago(1 * HOUR)),
      );
      messageRepository.findLastMessageDate.mockResolvedValue(null);

      await useCase.execute(command, now);

      expect(conversationRepository.save).not.toHaveBeenCalled();
    });

    it('sin mensajes usa la fecha de creación de la conversación (vencida)', async () => {
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(
        anActiveConversationCreatedAt(ago(5 * HOUR)),
      );
      messageRepository.findLastMessageDate.mockResolvedValue(null);

      await useCase.execute(command, now);

      expect(conversationRepository.save).toHaveBeenCalledTimes(2);
      expect(conversationRepository.save.mock.calls[0][0].status).toBe(ConversationStatus.CLOSED);
    });

    it('sin conversación activa: crea una nueva y no lee mensajes', async () => {
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(null);

      await useCase.execute(command, now);

      expect(messageRepository.findLastMessageDate).not.toHaveBeenCalled();
      expect(conversationRepository.save).toHaveBeenCalledTimes(1);
    });

    it('carrera al crear (otra conversación activa ganó): relee la activa y sigue con ella', async () => {
      const winner = anActiveConversationCreatedAt(ago(1000));
      conversationRepository.findActiveByBusinessAndCustomer
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      conversationRepository.save.mockRejectedValueOnce(new ActiveConversationAlreadyExistsError());

      await useCase.execute(command, now);

      expect(conversationRepository.findActiveByBusinessAndCustomer).toHaveBeenCalledTimes(2);
      expect(messageRepository.save.mock.calls[0][0].conversationId).toBe('conversation-old');
      expect(agentDispatchPort.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'conversation-old' }),
      );
    });

    it('carrera al crear pero la relectura no encuentra nada: propaga el error y no guarda el mensaje', async () => {
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(null);
      conversationRepository.save.mockRejectedValueOnce(new ActiveConversationAlreadyExistsError());

      await expect(useCase.execute(command, now)).rejects.toThrow(ActiveConversationAlreadyExistsError);

      expect(messageRepository.save).not.toHaveBeenCalled();
    });

    it('cualquier otro error al crear (p. ej. otro 23505) se propaga sin releer', async () => {
      conversationRepository.findActiveByBusinessAndCustomer.mockResolvedValue(null);
      conversationRepository.save.mockRejectedValueOnce(new Error('otra violación'));

      await expect(useCase.execute(command, now)).rejects.toThrow('otra violación');

      expect(conversationRepository.findActiveByBusinessAndCustomer).toHaveBeenCalledTimes(1);
      expect(messageRepository.save).not.toHaveBeenCalled();
    });
  });
});
