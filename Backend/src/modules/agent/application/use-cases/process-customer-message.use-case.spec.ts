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
import { UsageQuotaPort } from '../ports/out/usage-quota.port';
import { OrderPort } from '../ports/out/order.port';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { BusinessNotFoundError, IncomingMessageNotPersistedError } from '../../domain/errors/agent.errors';
import { ProcessCustomerMessageCommand } from '../dto/process-customer-message.command';
import { DEFAULT_UNAVAILABLE_MESSAGE, FALLBACK_RESPONSE_TEXT } from '../constants/agent-messages';
import { ORDER_REGISTRATION_FAILED_TEXT } from '../constants/order-reply.messages';

describe('ProcessCustomerMessageUseCase', () => {
  let agentConfigRepository: jest.Mocked<AgentConfigRepository>;
  let businessAttentionRepository: jest.Mocked<BusinessAttentionRepository>;
  let catalogRepository: jest.Mocked<CatalogRepository>;
  let conversationHistoryRepository: jest.Mocked<ConversationHistoryRepository>;
  let llmPort: jest.Mocked<LlmPort>;
  let tokenUsagePort: jest.Mocked<TokenUsagePort>;
  let usageQuotaPort: jest.Mocked<UsageQuotaPort>;
  let orderPort: jest.Mocked<OrderPort>;
  let useCase: ProcessCustomerMessageUseCase;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  const command: ProcessCustomerMessageCommand = {
    businessId: 'business-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    customerNumber: '+573001111111',
    message: '¿Qué tienen de comer?',
  };

  const BUSINESS_NAME = 'Mi Restaurante';

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
    usageQuotaPort = { hasQuota: jest.fn() };
    orderPort = { createOrder: jest.fn() };

    agentConfigRepository.findByBusinessId.mockResolvedValue(aConfig());
    businessAttentionRepository.getStatus.mockResolvedValue({
      businessName: BUSINESS_NAME,
      autoAttentionActive: true,
      businessActive: true,
    });
    catalogRepository.findByBusinessId.mockResolvedValue(catalog);
    conversationHistoryRepository.findRecentByConversationId.mockResolvedValue(history);
    llmPort.generateReply.mockResolvedValue({ text: 'Tenemos hamburguesas.', proposedOrder: null, tokensInput: 30, tokensOutput: 12 });
    tokenUsagePort.record.mockResolvedValue(undefined);
    usageQuotaPort.hasQuota.mockResolvedValue(true);

    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    useCase = new ProcessCustomerMessageUseCase(
      agentConfigRepository,
      businessAttentionRepository,
      catalogRepository,
      conversationHistoryRepository,
      llmPort,
      tokenUsagePort,
      usageQuotaPort,
      orderPort,
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
      businessName: BUSINESS_NAME,
      businessHours: null,
      isFirstMessage: false,
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
      messageId: command.messageId,
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

  describe('historial y contingencia', () => {
    it('pide el historial excluyendo el mensaje entrante por id y con el límite de 10', async () => {
      conversationHistoryRepository.countByConversationId.mockResolvedValue(5);

      await useCase.execute(command);

      expect(conversationHistoryRepository.findRecentByConversationId).toHaveBeenCalledWith(
        command.conversationId,
        10,
        command.messageId,
      );
    });

    it('primera interacción con el LLM caído: envía SOLO el texto de contingencia, sin bienvenida', async () => {
      conversationHistoryRepository.countByConversationId.mockResolvedValue(1);
      llmPort.generateReply.mockRejectedValue(new Error('LLM caído'));

      const result = await useCase.execute(command);

      expect(result?.responseText).toBe(FALLBACK_RESPONSE_TEXT);
      expect(result?.responseText).not.toContain(welcomeMessage);
    });

    it('sin configuración guardada: el LLM recibe el tono AMABLE y el estilo NEUTRO por defecto', async () => {
      agentConfigRepository.findByBusinessId.mockResolvedValue(null);
      conversationHistoryRepository.countByConversationId.mockResolvedValue(5);

      await useCase.execute(command);

      expect(llmPort.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: AgentTone.AMABLE,
          regionalStyle: AgentRegionalStyle.NEUTRO,
          personality: null,
        }),
      );
    });
  });

  describe('cuota de tokens (RNF-08)', () => {
    it('cuota agotada: devuelve null con un aviso solo con ids y no invoca LLM, catálogo, historial ni tokens', async () => {
      usageQuotaPort.hasQuota.mockResolvedValue(false);
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(useCase.execute(command)).resolves.toBeNull();

      expect(usageQuotaPort.hasQuota).toHaveBeenCalledWith(command.businessId);
      expect(llmPort.generateReply).not.toHaveBeenCalled();
      expect(tokenUsagePort.record).not.toHaveBeenCalled();
      expect(catalogRepository.findByBusinessId).not.toHaveBeenCalled();
      expect(conversationHistoryRepository.findRecentByConversationId).not.toHaveBeenCalled();
      const logged = String(warnSpy.mock.calls[0][0]);
      expect(logged).toContain(command.businessId);
      expect(logged).not.toContain(command.message);
      expect(logged).not.toContain(command.customerNumber);
      warnSpy.mockRestore();
    });

    it('con atención desactivada no se consulta la cuota (se responde el mensaje de no disponibilidad)', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({ businessName: BUSINESS_NAME, autoAttentionActive: false, businessActive: true });

      await useCase.execute(command);

      expect(usageQuotaPort.hasQuota).not.toHaveBeenCalled();
    });

    it('con cuota: el flujo sigue y se registra el consumo con el id del mensaje entrante', async () => {
      conversationHistoryRepository.countByConversationId.mockResolvedValue(5);

      await useCase.execute(command);

      expect(llmPort.generateReply).toHaveBeenCalledTimes(1);
      expect(tokenUsagePort.record).toHaveBeenCalledWith(expect.objectContaining({ messageId: command.messageId }));
    });
  });

  describe('guardas de atención', () => {
    it('negocio no activo: devuelve null y no toca LLM, historial, catálogo ni tokens', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        businessName: BUSINESS_NAME,
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
        businessName: BUSINESS_NAME,
        autoAttentionActive: false,
        businessActive: false,
      });

      await expect(useCase.execute(command)).resolves.toBeNull();
    });

    it('atención automática desactivada: responde el mensaje de no disponibilidad, sin LLM, tokens ni bienvenida', async () => {
      businessAttentionRepository.getStatus.mockResolvedValue({
        businessName: BUSINESS_NAME,
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
        businessName: BUSINESS_NAME,
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

  describe('pedido propuesto por el modelo', () => {
    const BURGER_ID = '11111111-1111-4111-8111-111111111111';
    const SODA_ID = '22222222-2222-4222-8222-222222222222';
    const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';
    const LLM_TEXT = 'TEXTO LIBRE DEL MODELO sobre el pedido';
    const ORDER_ID = '3f1c8a52-7d0e-4c1b-9a64-2b5e8f0d1c77';

    const burger: CatalogItem = { id: BURGER_ID, name: 'Hamburguesa clásica', description: null, price: 15000, available: true, categoryName: null };
    const soda: CatalogItem = { id: SODA_ID, name: 'Gaseosa agotada', description: null, price: 4000, available: false, categoryName: null };

    let loggerSpies: Array<jest.SpiedFunction<any>>;
    const allLogged = () =>
      loggerSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map(String).join(' '))
        .join('\n');

    const llmProposes = (items: { productId: string; quantity: number }[] | null) =>
      llmPort.generateReply.mockResolvedValue({
        text: LLM_TEXT,
        proposedOrder: items === null ? null : { items },
        tokensInput: 30,
        tokensOutput: 12,
      });

    beforeEach(() => {
      loggerSpies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      );
      catalogRepository.findByBusinessId.mockResolvedValue([burger, soda]);
      conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
    });

    afterEach(() => {
      // El describe externo restaura solo errorSpy; estos espías se limpian aquí.
      loggerSpies.forEach((spy) => spy.mockRestore());
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    it('CREATED sin rechazos: el texto lo construye el backend con datos reales y el del modelo se descarta', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 2 }]);
      orderPort.createOrder.mockResolvedValue({
        kind: 'CREATED',
        orderId: ORDER_ID,
        total: 30000,
        items: [{ productId: BURGER_ID, name: 'Hamburguesa clásica', quantity: 2, unitPrice: 15000 }],
        rejectedItems: [],
      });

      const result = await useCase.execute(command);
      const text = result?.responseText ?? '';

      expect(text).toContain('#3f1c8a52');
      expect(text.replace(/\u00a0/g, ' ')).toContain('$ 30.000');
      expect(text).toContain('Hamburguesa clásica × 2');
      expect(text).toContain('El negocio lo revisará');
      expect(text).toContain('por este chat');
      expect(text).not.toContain('No pude agregar');
      expect(text).not.toContain(LLM_TEXT);
    });

    it('hacia orders solo viajan businessId, conversationId e ítems (id y cantidad): nunca precios ni totales', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 2 }]);
      orderPort.createOrder.mockResolvedValue({ kind: 'NO_VALID_ITEMS', rejectedItems: [] });

      await useCase.execute(command);

      expect(orderPort.createOrder).toHaveBeenCalledTimes(1);
      const sent = orderPort.createOrder.mock.calls[0][0];
      expect(sent).toEqual({
        businessId: command.businessId,
        conversationId: command.conversationId,
        items: [{ productId: BURGER_ID, quantity: 2 }],
      });
      expect(JSON.stringify(sent)).not.toMatch(/price|total|unitPrice|15000/i);
    });

    it('CREATED con rechazados: nombra los del catálogo y los desconocidos genéricamente, sin repetir ids', async () => {
      llmProposes([
        { productId: BURGER_ID, quantity: 1 },
        { productId: SODA_ID, quantity: 1 },
        { productId: UNKNOWN_ID, quantity: 1 },
        { productId: 'id-inventado-por-el-modelo', quantity: 0 },
      ]);
      orderPort.createOrder.mockResolvedValue({
        kind: 'CREATED',
        orderId: ORDER_ID,
        total: 15000,
        items: [{ productId: BURGER_ID, name: 'Hamburguesa clásica', quantity: 1, unitPrice: 15000 }],
        rejectedItems: [
          { productId: SODA_ID.toUpperCase(), reason: 'UNAVAILABLE' },
          { productId: UNKNOWN_ID, reason: 'NOT_FOUND' },
          { productId: 'id-inventado-por-el-modelo', reason: 'INVALID_QUANTITY' },
        ],
      });

      const text = (await useCase.execute(command))?.responseText ?? '';

      expect(text).toContain('No pude agregar');
      expect(text).toContain('Gaseosa agotada: no está disponible por ahora');
      expect(text).toContain('Un producto que no está en el catálogo');
      expect(text).toContain('Un producto que no está en el catálogo: la cantidad no es válida');
      expect(text).not.toContain(UNKNOWN_ID);
      expect(text).not.toContain('id-inventado-por-el-modelo');
      expect(text).not.toContain(LLM_TEXT);
    });

    it('NO_VALID_ITEMS: explica que no se registró, lista los rechazados y pregunta por otros productos', async () => {
      llmProposes([{ productId: SODA_ID, quantity: 1 }]);
      orderPort.createOrder.mockResolvedValue({
        kind: 'NO_VALID_ITEMS',
        rejectedItems: [{ productId: SODA_ID, reason: 'UNAVAILABLE' }],
      });

      const text = (await useCase.execute(command))?.responseText ?? '';

      expect(text).toContain('No pude registrar tu pedido');
      expect(text).toContain('Gaseosa agotada: no está disponible por ahora');
      expect(text).toContain('¿Quieres elegir otros productos?');
      expect(text).not.toContain(LLM_TEXT);
    });

    it('CONVERSATION_ALREADY_HAS_ORDER: informa el pedido existente en revisión', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 1 }]);
      orderPort.createOrder.mockResolvedValue({ kind: 'CONVERSATION_ALREADY_HAS_ORDER', orderId: ORDER_ID });

      const text = (await useCase.execute(command))?.responseText ?? '';

      expect(text).toContain('Ya tienes el pedido #3f1c8a52 en revisión por el negocio');
      expect(text).not.toContain(LLM_TEXT);
    });

    it('el puerto lanza: responde el texto fijo de fallo técnico, no relanza, registra los tokens y loguea solo ids', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 1 }]);
      orderPort.createOrder.mockRejectedValue(
        Object.assign(new Error('violates foreign key product ' + BURGER_ID + ' Hamburguesa clásica'), { name: 'DbError' }),
      );

      const result = await useCase.execute(command);

      expect(result?.responseText).toBe(ORDER_REGISTRATION_FAILED_TEXT);
      expect(tokenUsagePort.record).toHaveBeenCalledTimes(1);
      const logged = allLogged();
      expect(logged).toContain(command.businessId);
      expect(logged).toContain(command.conversationId);
      expect(logged).not.toContain(BURGER_ID);
      expect(logged).not.toContain('Hamburguesa clásica');
    });

    it('proposedOrder con arreglo vacío se trata como null: no llama al puerto y responde el texto del modelo', async () => {
      llmProposes([]);

      const result = await useCase.execute(command);

      expect(orderPort.createOrder).not.toHaveBeenCalled();
      expect(result?.responseText).toBe(LLM_TEXT);
    });

    it('proposedOrder null: el flujo no cambia', async () => {
      llmProposes(null);

      const result = await useCase.execute(command);

      expect(orderPort.createOrder).not.toHaveBeenCalled();
      expect(result?.responseText).toBe(LLM_TEXT);
    });

    it('el registro de tokens del turno se hace igual que siempre', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 1 }]);
      orderPort.createOrder.mockResolvedValue({ kind: 'NO_VALID_ITEMS', rejectedItems: [] });

      await useCase.execute(command);

      expect(tokenUsagePort.record).toHaveBeenCalledWith({
        businessId: command.businessId,
        conversationId: command.conversationId,
        messageId: command.messageId,
        tokensInput: 30,
        tokensOutput: 12,
      });
    });

    it('la bienvenida se antepone al texto del pedido solo si es el primer mensaje', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 1 }]);
      orderPort.createOrder.mockResolvedValue({ kind: 'CONVERSATION_ALREADY_HAS_ORDER', orderId: ORDER_ID });

      conversationHistoryRepository.countByConversationId.mockResolvedValue(1);
      const first = (await useCase.execute(command))?.responseText ?? '';
      expect(first.startsWith(welcomeMessage + '\n\n')).toBe(true);
      expect(first).toContain('Ya tienes el pedido');

      conversationHistoryRepository.countByConversationId.mockResolvedValue(5);
      const later = (await useCase.execute(command))?.responseText ?? '';
      expect(later).not.toContain(welcomeMessage);
    });

    it('ningún log contiene nombres de producto, ids de producto, teléfono ni el mensaje del cliente', async () => {
      llmProposes([{ productId: BURGER_ID, quantity: 1 }]);
      orderPort.createOrder
        .mockResolvedValueOnce({
          kind: 'CREATED',
          orderId: ORDER_ID,
          total: 15000,
          items: [{ productId: BURGER_ID, name: 'Hamburguesa clásica', quantity: 1, unitPrice: 15000 }],
          rejectedItems: [{ productId: SODA_ID, reason: 'UNAVAILABLE' }],
        })
        .mockRejectedValueOnce(new Error('falló ' + BURGER_ID));

      await useCase.execute(command);
      await useCase.execute(command);

      const logged = allLogged();
      expect(logged).not.toContain('Hamburguesa');
      expect(logged).not.toContain('Gaseosa');
      expect(logged).not.toContain(BURGER_ID);
      expect(logged).not.toContain(SODA_ID);
      expect(logged).not.toContain(command.customerNumber);
      expect(logged).not.toContain(command.message);
    });
  });

  describe('contrato nuevo con el LLM', () => {
    it('pasa businessName, businessHours e isFirstMessage', async () => {
      const hours = { lunes: '8-18' };
      agentConfigRepository.findByBusinessId.mockResolvedValue(
        AgentConfig.create({
          id: 'config-1',
          businessId: command.businessId,
          personality: null,
          tone: null,
          regionalStyle: null,
          welcomeMessage: null,
          unavailableMessage: null,
          businessHours: hours,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      conversationHistoryRepository.countByConversationId.mockResolvedValue(1);

      await useCase.execute(command);

      expect(llmPort.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: BUSINESS_NAME, businessHours: hours, isFirstMessage: true }),
      );
    });
  });
});
