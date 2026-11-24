import {
  GenerateReplyParams,
  GenerateReplyResult,
  LlmPort,
  ProposedOrder,
} from '../../application/ports/out/llm.port';
import {
  CreateOrderCommand,
  CreateOrderResult,
  OrderPort,
  RejectedOrderItem,
} from '../../application/ports/out/order.port';
import {
  RecordTokenUsageCommand,
  TokenUsagePort,
} from '../../application/ports/out/token-usage.port';
import { UsageQuotaPort } from '../../application/ports/out/usage-quota.port';

/**
 * Puerto en memoria para registrar consumo de tokens de IA.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 157: FUNCTION "public"."registrar_consumo_ia"
 * - Respalda: schema_snapshot.sql línea 276-277:
 *     CONSTRAINT "consumo_ia_tokens_entrada_check" CHECK (tokens_entrada >= 0)
 *     CONSTRAINT "consumo_ia_tokens_salida_check" CHECK (tokens_salida >= 0)
 * - Respalda: schema_snapshot.sql línea 564: CONSTRAINT "unique_negocio_periodo" UNIQUE ("negocio_id", "periodo_inicio")
 */
export class InMemoryTokenUsageAdapter implements TokenUsagePort {
  private readonly usages: RecordTokenUsageCommand[] = [];
  private shouldFail = false;

  async record(command: RecordTokenUsageCommand): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Database connection failure while executing registrar_consumo_ia');
    }

    if (command.tokensInput < 0) {
      throw new Error('consumo_ia_tokens_entrada_check: tokens_entrada no puede ser negativo');
    }
    if (command.tokensOutput < 0) {
      throw new Error('consumo_ia_tokens_salida_check: tokens_salida no puede ser negativo');
    }

    this.usages.push({ ...command });
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  getUsages(): RecordTokenUsageCommand[] {
    return [...this.usages];
  }

  getUsagesByBusiness(businessId: string): RecordTokenUsageCommand[] {
    return this.usages.filter((u) => u.businessId === businessId);
  }

  clear(): void {
    this.usages.length = 0;
    this.shouldFail = false;
  }
}

/**
 * Puerto en memoria para verificar la cuota de tokens.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 26: FUNCTION "public"."consultar_cuota_tokens"
 */
export class InMemoryUsageQuotaAdapter implements UsageQuotaPort {
  private readonly quotasByBusiness = new Map<string, boolean>();

  async hasQuota(businessId: string): Promise<boolean> {
    // Si no se especifica, por defecto asumimos que tiene cuota disponible
    return this.quotasByBusiness.get(businessId) ?? true;
  }

  setQuota(businessId: string, hasQuota: boolean): void {
    this.quotasByBusiness.set(businessId, hasQuota);
  }

  clear(): void {
    this.quotasByBusiness.clear();
  }
}

/**
 * Puerto en memoria para gestionar pedidos desde el agente.
 *
 * Restricciones fieles de base de datos:
 * - Respalda: schema_snapshot.sql línea 622: CREATE UNIQUE INDEX "uq_pedidos_conversacion_abierto"
 *     ON "public"."pedidos" ("conversacion_id") WHERE ("estado_codigo" <> 'cancelado')
 * - Respalda: schema_snapshot.sql línea 67: FUNCTION "public"."crear_pedido"
 */
export class InMemoryOrderAdapter implements OrderPort {
  private readonly openOrdersByConversation = new Map<string, string>();
  private readonly createdOrders: Array<{
    command: CreateOrderCommand;
    orderId: string;
    total: number;
  }> = [];
  private shouldFail = false;
  private forcedResponse: CreateOrderResult | null = null;

  async createOrder(command: CreateOrderCommand): Promise<CreateOrderResult> {
    if (this.shouldFail) {
      throw new Error('Database connection failure while executing crear_pedido');
    }

    if (this.forcedResponse) {
      return this.forcedResponse;
    }

    // Regla fiel de base de datos: uq_pedidos_conversacion_abierto
    const existingOrderId = this.openOrdersByConversation.get(command.conversationId);
    if (existingOrderId) {
      return {
        kind: 'CONVERSATION_ALREADY_HAS_ORDER',
        orderId: existingOrderId,
      };
    }

    if (!command.items || command.items.length === 0) {
      return {
        kind: 'NO_VALID_ITEMS',
        rejectedItems: [],
      };
    }

    const orderId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const items = command.items.map((item, index) => ({
      productId: item.productId,
      name: `Producto ${item.productId}`,
      quantity: item.quantity,
      unitPrice: 15000 + index * 5000,
    }));

    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    this.openOrdersByConversation.set(command.conversationId, orderId);
    this.createdOrders.push({ command, orderId, total });

    return {
      kind: 'CREATED',
      orderId,
      total,
      items,
      rejectedItems: [],
    };
  }

  setOpenOrder(conversationId: string, orderId: string): void {
    this.openOrdersByConversation.set(conversationId, orderId);
  }

  setForcedResponse(response: CreateOrderResult | null): void {
    this.forcedResponse = response;
  }

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  getCreatedOrders(): Array<{ command: CreateOrderCommand; orderId: string; total: number }> {
    return [...this.createdOrders];
  }

  clear(): void {
    this.openOrdersByConversation.clear();
    this.createdOrders.length = 0;
    this.shouldFail = false;
    this.forcedResponse = null;
  }
}

/**
 * Adaptador configurable de LLM para pruebas de integración de flujos.
 */
export class ConfigurableLlmAdapter implements LlmPort {
  private cannedResult: GenerateReplyResult = {
    text: 'Hola, soy tu asistente virtual. ¿En qué te puedo colaborar?',
    proposedOrder: null,
    tokensInput: 25,
    tokensOutput: 15,
    model: 'gemini-1.5-flash',
  };
  private errorToThrow: Error | null = null;
  public readonly calls: GenerateReplyParams[] = [];

  async generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
    this.calls.push(params);

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    return this.cannedResult;
  }

  setResponse(result: Partial<GenerateReplyResult>): void {
    this.cannedResult = {
      ...this.cannedResult,
      ...result,
    };
    this.errorToThrow = null;
  }

  setError(error: Error): void {
    this.errorToThrow = error;
  }

  clear(): void {
    this.cannedResult = {
      text: 'Hola, soy tu asistente virtual. ¿En qué te puedo colaborar?',
      proposedOrder: null,
      tokensInput: 25,
      tokensOutput: 15,
      model: 'gemini-1.5-flash',
    };
    this.errorToThrow = null;
    this.calls.length = 0;
  }
}
