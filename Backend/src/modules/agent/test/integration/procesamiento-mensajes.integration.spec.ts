import 'reflect-metadata';
import { AgentTestApp } from '../support/agent-test-app';
import { AgentTestDataBuilder } from '../support/builders';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { IncomingMessageNotPersistedError } from '../../domain/errors/agent.errors';
import { DEFAULT_UNAVAILABLE_MESSAGE, FALLBACK_RESPONSE_TEXT } from '../../application/constants/agent-messages';

describe('Flujo de Integración: Procesamiento de Mensajes de Clientes', () => {
  const testApp = new AgentTestApp();
  const BUSINESS_ID = 'business-test-1';
  const CONVERSATION_ID = 'conv-test-1';
  const INCOMING_MSG_ID = 'msg-incoming-100';

  beforeAll(async () => {
    await testApp.initialize();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.reset();

    // Estado base: negocio activo y con atención automática
    testApp.businessAttentionRepo.seed(BUSINESS_ID, {
      businessName: 'Hamburguesería La Central',
      autoAttentionActive: true,
      businessActive: true,
    });

    // Catálogo base con productos disponibles
    testApp.catalogRepo.seed(BUSINESS_ID, [
      AgentTestDataBuilder.aCatalogItem({ id: 'p1', name: 'Hamburguesa Doble', price: 25000, available: true }),
      AgentTestDataBuilder.aCatalogItem({ id: 'p2', name: 'Papas Especiales', price: 12000, available: true }),
    ]);

    // Cuota de tokens disponible
    testApp.usageQuotaPort.setQuota(BUSINESS_ID, true);
  });

  it('IT-AGENT-09: cuando el negocio está inactivo (businessActive: false), el agente no responde (null)', async () => {
    testApp.businessAttentionRepo.seed(BUSINESS_ID, {
      businessName: 'Hamburguesería La Central',
      autoAttentionActive: true,
      businessActive: false,
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: '¿Están abiertos?',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).toBeNull();
    expect(testApp.llmPort.calls).toHaveLength(0);
  });

  it('IT-AGENT-10: cuando la atención automática está desactivada, entrega el mensaje de no disponibilidad sin llamar al LLM', async () => {
    const config = AgentTestDataBuilder.anAgentConfig({
      businessId: BUSINESS_ID,
      unavailableMessage: 'La atención automática está pausada. Un asesor humano te responderá pronto.',
    });
    testApp.agentConfigRepo.seed(config);

    testApp.businessAttentionRepo.seed(BUSINESS_ID, {
      businessName: 'Hamburguesería La Central',
      autoAttentionActive: false,
      businessActive: true,
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe('La atención automática está pausada. Un asesor humano te responderá pronto.');
    expect(testApp.llmPort.calls).toHaveLength(0);
    expect(testApp.tokenUsagePort.getUsages()).toHaveLength(0);
  });

  it('IT-AGENT-11: si no hay mensajes en la conversación (count = 0), lanza IncomingMessageNotPersistedError', async () => {
    // No se inserta ningún mensaje en el historial, violando la precondición no negociable
    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
    });

    await expect(testApp.processCustomerMessageUseCase.execute(command)).rejects.toThrow(
      IncomingMessageNotPersistedError,
    );
    expect(testApp.llmPort.calls).toHaveLength(0);
  });

  it('IT-AGENT-12: en el primer mensaje (count = 1), antepone el mensaje de bienvenida configurado a la respuesta del LLM', async () => {
    const config = AgentTestDataBuilder.anAgentConfig({
      businessId: BUSINESS_ID,
      welcomeMessage: '¡Hola! Qué gusto saludarte en La Central.',
      tone: AgentTone.AMABLE,
      regionalStyle: AgentRegionalStyle.PAISA,
    });
    testApp.agentConfigRepo.seed(config);

    // Simulamos que el mensaje entrante ya está persistido (count = 1)
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: 'Buenas tardes',
      }),
    );

    testApp.llmPort.setResponse({
      text: 'Claro que sí, con gusto te ofrezco nuestro menú de hamburguesas.',
      tokensInput: 40,
      tokensOutput: 20,
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Buenas tardes',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe(
      '¡Hola! Qué gusto saludarte en La Central.\n\nClaro que sí, con gusto te ofrezco nuestro menú de hamburguesas.',
    );

    // Verificamos que al LLM se le pasó isFirstMessage = true
    expect(testApp.llmPort.calls[0].isFirstMessage).toBe(true);
    expect(testApp.llmPort.calls[0].personality).toBe(config.personality);
  });

  it('IT-AGENT-13: en mensajes posteriores (count > 1), NO repite la bienvenida y pasa el historial de turnos previos', async () => {
    const config = AgentTestDataBuilder.anAgentConfig({
      businessId: BUSINESS_ID,
      welcomeMessage: '¡Bienvenido!',
    });
    testApp.agentConfigRepo.seed(config);

    // Mensaje 1 previo: cliente
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: 'msg-prev-1',
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: 'Hola',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      }),
    );

    // Mensaje 2 previo: agente
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: 'msg-prev-2',
        conversationId: CONVERSATION_ID,
        sender: 'agente_ia',
        content: '¡Hola! ¿Qué deseas ordenar?',
        createdAt: new Date('2026-01-01T10:00:05Z'),
      }),
    );

    // Mensaje 3 actual (count = 3): cliente
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: '¿Tienen combos?',
        createdAt: new Date('2026-01-01T10:01:00Z'),
      }),
    );

    testApp.llmPort.setResponse({
      text: 'Sí, todas nuestras hamburguesas vienen en combo.',
      tokensInput: 50,
      tokensOutput: 15,
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: '¿Tienen combos?',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    // No debe contener la bienvenida
    expect(result?.responseText).toBe('Sí, todas nuestras hamburguesas vienen en combo.');

    // Verificamos parámetros al LLM
    const callParams = testApp.llmPort.calls[0];
    expect(callParams.isFirstMessage).toBe(false);
    expect(callParams.history).toHaveLength(2);
    expect(callParams.history[0].content).toBe('Hola');
    expect(callParams.history[1].content).toBe('¡Hola! ¿Qué deseas ordenar?');
  });

  it('IT-AGENT-14: si el LLM falla, responde con el texto de contingencia sin romper el flujo del cliente', async () => {
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: 'Hola',
      }),
    );

    testApp.llmPort.setError(new Error('Rate limit exceeded / Timeout de IA'));

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Hola',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toBe(FALLBACK_RESPONSE_TEXT);
    // No debe registrar consumo si el LLM falló
    expect(testApp.tokenUsagePort.getUsages()).toHaveLength(0);
  });

  it('IT-AGENT-15: si el registro de tokens falla, la respuesta al cliente igualmente se entrega (resiliencia)', async () => {
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: 'Quiero una hamburguesa',
      }),
    );

    testApp.llmPort.setResponse({
      text: 'Tenemos la Hamburguesa Doble a $25.000.',
      tokensInput: 30,
      tokensOutput: 10,
    });

    // Simulamos fallo en la base de datos para la telemetría
    testApp.tokenUsagePort.setShouldFail(true);

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Quiero una hamburguesa',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toContain('Tenemos la Hamburguesa Doble a $25.000.');
  });
});
