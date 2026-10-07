import { Logger } from '@nestjs/common';
import { ProcessCustomerMessageUseCase } from './process-customer-message.use-case';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { CatalogItem, CatalogRepository } from '../../domain/repositories/catalog.repository';
import {
  ConversationHistoryRepository,
  HistoryMessage,
} from '../../domain/repositories/conversation-history.repository';
import { LlmPort } from '../ports/out/llm.port';
import { TokenUsagePort } from '../ports/out/token-usage.port';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { IncomingMessageNotPersistedError } from '../../domain/errors/agent.errors';
import { ProcessCustomerMessageCommand } from '../dto/process-customer-message.command';

describe('ProcessCustomerMessageUseCase', () => {
  let agentConfigRepository: jest.Mocked<AgentConfigRepository>;
  let catalogRepository: jest.Mocked<CatalogRepository>;
  let conversationHistoryRepository: jest.Mocked<ConversationHistoryRepository>;
  let llmPort: jest.Mocked<LlmPort>;
  let tokenUsagePort: jest.Mocked<TokenUsagePort>;
  let useCase: ProcessCustomerMessageUseCase;
  let errorSpy: jest.SpyInstance;

  const command: ProcessCustomerMessageCommand = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    customerNumber: '+573001111111',
    message: '¿Qué tienen de comer?',
  };

  const welcomeMessage = '¡Bienvenido a Mi Restaurante!';

  const catalog: CatalogItem[] = [
    {
      id: 'p1',
      name: 'Hamburguesa',
      description: null,
      price: 18000,
      available: true,
      categoryName: 'Comida',
    },
  ];

  const history: HistoryMessage[] = [
    { sender: 'CUSTOMER', content: 'Hola', createdAt: new Date() },
    { sender: 'AGENT', content: 'Hola, ¿en qué te ayudo?', createdAt: new Date() },
  ];

  const aConfig = () =>
    AgentConfig.create({
      id: 'config-1',
      businessId: command.businessId,
      personality: 'amable',
      tone: 'informal',
      welcomeMessage,
      businessHours: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    agentConfigRepository = { findByBusinessId: jest.fn(), save: jest.fn() };
    catalogRepository = { findAvailableByBusinessId: jest.fn() };
    conversationHistoryRepository = {
      countByConversationId: jest.fn(),
      findRecentByConversationId: jest.fn(),
    };
    llmPort = { generateReply: jest.fn() };
    tokenUsagePort = { record: jest.fn() };

    agentConfigRepository.findByBusinessId.mockResolvedValue(aConfig());
    catalogRepository.findAvailableByBusinessId.mockResolvedValue(catalog);
    conversationHistoryRepository.findRecentByConversationId.mockResolvedValue(history);
    llmPort.generateReply.mockResolvedValue({ text: 'Tenemos hamburguesas.', tokensInput: 30, tokensOutput: 12 });
    tokenUsagePort.record.mockResolvedValue(undefined);

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    useCase = new ProcessCustomerMessageUseCase(
      agentConfigRepository,
      catalogRepository,
      conversationHistoryRepository,
      llmPort,
      tokenUsagePort,
    );
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('primera interacción: antepone el mensaje de bienvenida a la respuesta del LLM', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(1);

    const result = await useCase.execute(command);

    expect(result.responseText).toBe(`${welcomeMessage}\n\nTenemos hamburguesas.`);
  });

  it('camino feliz: llama al LLM con config/catálogo/historial, registra tokens y no antepone bienvenida', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);

    const result = await useCase.execute(command);

    expect(llmPort.generateReply).toHaveBeenCalledWith({
      personality: 'amable',
      tone: 'informal',
      catalog,
      history,
      customerMessage: command.message,
    });
    expect(tokenUsagePort.record).toHaveBeenCalledWith({
      businessId: command.businessId,
      conversationId: command.conversationId,
      tokensInput: 30,
      tokensOutput: 12,
    });
    expect(result.responseText).toBe('Tenemos hamburguesas.');
  });

  it('el LLM falla: devuelve el texto de respaldo, no lanza y no registra consumo', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
    llmPort.generateReply.mockRejectedValue(new Error('LLM caído'));

    const result = await useCase.execute(command);

    expect(result.responseText).toContain('inconveniente');
    expect(tokenUsagePort.record).not.toHaveBeenCalled();
  });

  it('record() falla: NO descarta la respuesta ya generada por el LLM', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
    tokenUsagePort.record.mockRejectedValue(new Error('tabla consumo_ia no existe'));

    const result = await useCase.execute(command);

    expect(result.responseText).toBe('Tenemos hamburguesas.');
    expect(result.responseText).not.toContain('inconveniente');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('consumo de tokens'));
  });

  it('precondición violada (0 mensajes en la conversación): lanza y no invoca al LLM', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(0);

    await expect(useCase.execute(command)).rejects.toThrow(IncomingMessageNotPersistedError);

    expect(llmPort.generateReply).not.toHaveBeenCalled();
    expect(tokenUsagePort.record).not.toHaveBeenCalled();
  });
});
