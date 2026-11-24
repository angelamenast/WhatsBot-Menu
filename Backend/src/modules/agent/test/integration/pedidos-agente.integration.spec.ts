import 'reflect-metadata';
import { AgentTestApp } from '../support/agent-test-app';
import { AgentTestDataBuilder } from '../support/builders';
import { ORDER_REGISTRATION_FAILED_TEXT } from '../../application/constants/order-reply.messages';

describe('Flujo de Integración: Generación de Pedidos Asistidos por Agente', () => {
  const testApp = new AgentTestApp();
  const BUSINESS_ID = 'business-test-1';
  const CONVERSATION_ID = 'conv-test-orders-1';
  const INCOMING_MSG_ID = 'msg-incoming-order-1';

  beforeAll(async () => {
    await testApp.initialize();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.reset();

    testApp.businessAttentionRepo.seed(BUSINESS_ID, {
      businessName: 'Pizzería Napolitana',
      autoAttentionActive: true,
      businessActive: true,
    });

    // Catálogo con nombres específicos
    testApp.catalogRepo.seed(BUSINESS_ID, [
      AgentTestDataBuilder.aCatalogItem({ id: 'p-pizza-1', name: 'Pizza Pepperoni Familiar', price: 45000, available: true }),
      AgentTestDataBuilder.aCatalogItem({ id: 'p-gaseosa-1', name: 'Gaseosa 1.5L', price: 8000, available: true }),
      AgentTestDataBuilder.aCatalogItem({ id: 'p-postre-1', name: 'Tiramisú', price: 12000, available: false }),
    ]);

    testApp.usageQuotaPort.setQuota(BUSINESS_ID, true);

    // Mensaje entrante ya persistido
    testApp.conversationHistoryRepo.seedMessage(
      AgentTestDataBuilder.aStoredMessage({
        id: INCOMING_MSG_ID,
        conversationId: CONVERSATION_ID,
        sender: 'cliente',
        content: 'Quiero pedir una pizza familiar y una gaseosa',
      }),
    );
  });

  it('IT-AGENT-16: cuando el LLM propone un pedido válido, se crea el pedido y se responde con el resumen formateado exacto', async () => {
    testApp.llmPort.setResponse({
      text: 'Texto alucinado por el modelo que debe ser descartado',
      proposedOrder: {
        items: [
          { productId: 'p-pizza-1', quantity: 1 },
          { productId: 'p-gaseosa-1', quantity: 2 },
        ],
      },
      tokensInput: 60,
      tokensOutput: 30,
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Quiero pedir una pizza familiar y una gaseosa',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    // No debe contener el texto libre alucinado del modelo
    expect(result?.responseText).not.toContain('Texto alucinado por el modelo');
    // Debe contener confirmación del pedido y total
    expect(result?.responseText).toContain('¡Listo! Registré tu pedido');
    expect(result?.responseText).toContain('55.000');
    expect(result?.responseText).toContain('El negocio lo revisará y lo confirmará');

    // Verificamos que la orden fue persistida a través del OrderPort
    const created = testApp.orderPort.getCreatedOrders();
    expect(created).toHaveLength(1);
    expect(created[0].command.businessId).toBe(BUSINESS_ID);
    expect(created[0].command.conversationId).toBe(CONVERSATION_ID);
    expect(created[0].command.items).toEqual([
      { productId: 'p-pizza-1', quantity: 1 },
      { productId: 'p-gaseosa-1', quantity: 2 },
    ]);
  });

  it('IT-AGENT-17: cuando los productos propuestos no son válidos (agotados), responde indicando que no se pudo crear', async () => {
    testApp.orderPort.setForcedResponse({
      kind: 'NO_VALID_ITEMS',
      rejectedItems: [{ productId: 'p-postre-1', reason: 'UNAVAILABLE' }],
    });

    testApp.llmPort.setResponse({
      text: 'Listo, te anoto el tiramisú.',
      proposedOrder: {
        items: [{ productId: 'p-postre-1', quantity: 1 }],
      },
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Quiero un tiramisú',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toContain('No pude registrar tu pedido');
    // Debe nombrar el producto usando el nombre del catálogo real
    expect(result?.responseText).toContain('Tiramisú');
    expect(result?.responseText).toContain('no está disponible por ahora');
  });

  it('IT-AGENT-18: si la conversación ya tiene un pedido abierto (uq_pedidos_conversacion_abierto), responde informando el pedido existente', async () => {
    // Marcamos que ya hay un pedido abierto en la conversación
    testApp.orderPort.setOpenOrder(CONVERSATION_ID, 'order-existente-abc');

    testApp.llmPort.setResponse({
      text: 'Te anoto otra pizza',
      proposedOrder: {
        items: [{ productId: 'p-pizza-1', quantity: 1 }],
      },
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Agrégame otra pizza',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toContain('Ya tienes el pedido');
    expect(result?.responseText).toContain('en revisión por el negocio');
  });

  it('IT-AGENT-19: si ocurre un fallo inesperado al crear el pedido, responde con mensaje de contingencia seguro', async () => {
    testApp.orderPort.setShouldFail(true);

    testApp.llmPort.setResponse({
      text: 'Creando pedido',
      proposedOrder: {
        items: [{ productId: 'p-pizza-1', quantity: 1 }],
      },
    });

    const command = AgentTestDataBuilder.aCommand({
      businessId: BUSINESS_ID,
      conversationId: CONVERSATION_ID,
      messageId: INCOMING_MSG_ID,
      message: 'Confirmar pedido',
    });

    const result = await testApp.processCustomerMessageUseCase.execute(command);

    expect(result).not.toBeNull();
    expect(result?.responseText).toContain(ORDER_REGISTRATION_FAILED_TEXT);
  });
});
