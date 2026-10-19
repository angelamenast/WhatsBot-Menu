import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ProcessCustomerMessageUseCase } from './process-customer-message.use-case';
import { BusinessAttentionRepository } from '../../domain/repositories/business-attention.repository';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { CatalogItem, CatalogRepository } from '../../domain/repositories/catalog.repository';
import {
  ConversationHistoryRepository,
  HistoryMessage,
} from '../../domain/repositories/conversation-history.repository';
import { LlmPort } from '../ports/out/llm.port';
import { TokenUsagePort } from '../ports/out/token-usage.port';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { BusinessNotFoundError, IncomingMessageNotPersistedError } from '../../domain/errors/agent.errors';
import { ProcessCustomerMessageCommand } from '../dto/process-customer-message.command';
import { DEFAULT_UNAVAILABLE_MESSAGE, FALLBACK_RESPONSE_TEXT } from '../constants/agent-messages';

describe('ProcessCustomerMessageUseCase', () => {
  let agentConfigRepository: jest.Mocked<AgentConfigRepository>;
  let businessAttentionRepository: jest.Mocked<BusinessAttentionRepository>;
  let catalogRepository: jest.Mocked<CatalogRepository>;
  let conversationHistoryRepository: jest.Mocked<ConversationHistoryRepository>;
  let llmPort: jest.Mocked<LlmPort>;
  let tokenUsagePort: jest.Mocked<TokenUsagePort>;
  let useCase: ProcessCustomerMessageUseCase;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  const command: ProcessCustomerMessageCommand = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
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
      tone: AgentTone.CERCANO,
      regionalStyle: AgentRegionalStyle.PAISA,
      welcomeMessage,
      unavailableMessage: 'Estamos cerrados por hoy.',
      businessHours: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(() => {
    agentConfigRepository = { findByBusinessId: jest.fn(), save: jest.fn() };
    businessAttentionRepository = { getStatus: jest.fn() };
    catalogRepository = { findByBusinessId: jest.fn() };
    conversationHistoryRepository = {
      countByConversationId: jest.fn(),
      findRecentByConversationId: jest.fn(),
    };
    llmPort = { generateReply: jest.fn() };
    tokenUsagePort = { record: jest.fn() };

    agentConfigRepository.findByBusinessId.mockResolvedValue(aConfig());
    businessAttentionRepository.getStatus.mockResolvedValue({
      autoAttentionActive: true,
      businessActive: true,
    });
    catalogRepository.findByBusinessId.mockResolvedValue(catalog);
    conversationHistoryRepository.findRecentByConversationId.mockResolvedValue(history);
    llmPort.generateReply.mockResolvedValue({ text: 'Tenemos hamburguesas.', tokensInput: 30, tokensOutput: 12 });
    tokenUsagePort.record.mockResolvedValue(undefined);

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    useCase = new ProcessCustomerMessageUseCase(
      agentConfigRepository,
      businessAttentionRepository,
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

    expect(result?.responseText).toBe(`${welcomeMessage}\n\nTenemos hamburguesas.`);
  });

  it('camino feliz: llama al LLM con config/catálogo/historial, registra tokens y no antepone bienvenida', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);

    const result = await useCase.execute(command);

    expect(llmPort.generateReply).toHaveBeenCalledWith({
      personality: 'amable',
      tone: AgentTone.CERCANO,
      regionalStyle: AgentRegionalStyle.PAISA,
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
    expect(result?.responseText).toBe('Tenemos hamburguesas.');
  });

  it('el LLM falla: devuelve el texto de respaldo, no lanza y no registra consumo', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
    llmPort.generateReply.mockRejectedValue(new Error('LLM caído'));

    const result = await useCase.execute(command);

    expect(result?.responseText).toContain('inconveniente');
    expect(tokenUsagePort.record).not.toHaveBeenCalled();
  });

  it('record() falla: NO descarta la respuesta ya generada por el LLM', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
    tokenUsagePort.record.mockRejectedValue(new Error('tabla consumo_ia no existe'));

    const result = await useCase.execute(command);

    expect(result?.responseText).toBe('Tenemos hamburguesas.');
    expect(result?.responseText).not.toContain('inconveniente');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('consumo de tokens'));
  });

  it('precondición violada (0 mensajes en la conversación): lanza y no invoca al LLM', async () => {
    conversationHistoryRepository.countByConversationId.mockResolvedValue(0);

    await expect(useCase.execute(command)).rejects.toThrow(IncomingMessageNotPersistedError);

    expect(llmPort.generateReply).not.toHaveBeenCalled();
    expect(tokenUsagePort.record).not.toHaveBeenCalled();
  });

  describe('guardas de atención', () => {
    it('negocio no activo: devuelve null y no toca LLM, historial, catálogo ni tokens', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        autoAttentionActive: true,
        businessActive: false,
      });

      await expect(useCase.execute(command)).resolves.toBeNull();

      expect(llmPort.generateReply).not.toHaveBeenCalled();
      expect(tokenUsagePort.record).not.toHaveBeenCalled();
      expect(catalogRepository.findByBusinessId).not.toHaveBeenCalled();
      expect(conversationHistoryRepository.countByConversationId).not.toHaveBeenCalled();
    });

    it('negocio no activo tiene prioridad sobre la atención automática desactivada', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        autoAttentionActive: false,
        businessActive: false,
      });

      await expect(useCase.execute(command)).resolves.toBeNull();
    });

    it('atención automática desactivada: responde el mensaje de no disponibilidad, sin LLM, tokens ni bienvenida', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        autoAttentionActive: false,
        businessActive: true,
      });
      conversationHistoryRepository.countByConversationId.mockResolvedValue(1);

      const result = await useCase.execute(command);

      expect(result).toEqual({ responseText: 'Estamos cerrados por hoy.' });
      expect(llmPort.generateReply).not.toHaveBeenCalled();
      expect(tokenUsagePort.record).not.toHaveBeenCalled();
      expect(catalogRepository.findByBusinessId).not.toHaveBeenCalled();
    });

    it('atención desactivada sin mensaje propio: usa el texto por defecto', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        autoAttentionActive: false,
        businessActive: true,
      });
      agentConfigRepository.findByBusinessId.mockResolvedValue(null);

      const result = await useCase.execute(command);

      expect(result).toEqual({ responseText: DEFAULT_UNAVAILABLE_MESSAGE });
    });

    it('el negocio no existe: el error tipado se propaga y no hay respuesta', async () => {
      businessAttentionRepository.getStatus.mockRejectedValue(new BusinessNotFoundError('business-1'));

      await expect(useCase.execute(command)).rejects.toThrow(BusinessNotFoundError);

      expect(llmPort.generateReply).not.toHaveBeenCalled();
    });
  });
});
