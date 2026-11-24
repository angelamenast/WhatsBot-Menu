import 'reflect-metadata';
import { AgentTestApp } from '../support/agent-test-app';
import { AgentTestDataBuilder } from '../support/builders';

describe('Flujo de Integración: Control de Cuota y Consumo de Tokens de IA', () => {
  const testApp = new AgentTestApp();
  const BUSINESS_ID = 'business-test-quota';
  const CONVERSATION_ID = 'conv-test-quota';
  const INCOMING_MSG_ID = 'msg-quota-1';

  beforeAll(async () => {
    await testApp.initialize();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.reset();

    testApp.businessAttentionRepo.seed(BUSINESS_ID, {
      businessName: 'Café & Libros',
      autoAttentionActive: true,
      businessActive: true,
    });

    testApp.catalogRepo.seed(BUSINESS_ID, [
      AgentTestDataBuilder.aCatalogItem({ id: 'prod-cafe', name: 'Café Americano', price: 6000 }),
    ]);

    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: '¿Tienen café descafeinado?',
      }),
    );
  });

  it('IT-AGENT-20: cuando la cuota de tokens está agotada (RNF-08), el agente se silencia (retorna null) y no invoca al LLM', async () => {
    testApp.usageQuotaPort.setQuota(BUSINESS_ID, false);

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: '¿Tienen café descafeinado?',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).toBeNull();
    expect(testApp.llmPort.calls).toHaveLength(0);
    expect(testApp.tokenUsagePort.getUsages()).toHaveLength(0);
  });

  it('IT-AGENT-21: cuando hay cuota disponible, registra fielmente el consumo de tokens de entrada y salida', async () => {
    testApp.usageQuotaPort.setQuota(BUSINESS_ID, true);

    testApp.llmPort.setResponse({
      text: 'Sí, disponemos de café descafeinado.',
      tokensInput: 45,
      tokensOutput: 18,
      model: 'gemini-1.5-flash',
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: '¿Tienen café descafeinado?',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toContain('Sí, disponemos de café descafeinado.');

    // Verificación de integración del registro de tokens
    const usages = testApp.tokenUsagePort.getUsagesByBusiness(BUSINESS_ID);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toEqual({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      tokensInput: 45,
      tokensOutput: 18,
      model: 'gemini-1.5-flash',
    });
  });

  it('IT-AGENT-22: el adaptador de tokens rechaza registros con tokens negativos según restricciones CHECK de base de datos', async () => {
    await expect(
      testApp.tokenUsagePort.record({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
        messageId: INCOMING_MSG_ID,
        tokensInput: -5,
        tokensOutput: 10,
      }),
    ).rejects.toThrow('consumo_ia_tokens_entrada_check');

    await expect(
      testApp.tokenUsagePort.record({
        businessId: BUSINESS_ID,
        conversationId: CONVERSATION_ID,
        messageId: INCOMING_MSG_ID,
        tokensInput: 10,
        tokensOutput: -1,
      }),
    ).rejects.toThrow('consumo_ia_tokens_salida_check');
  });
});
