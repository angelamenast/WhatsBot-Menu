export interface CreateOrderItem {
  productId: string;
  quantity: number;
}

export interface CreateOrderCommand {
  businessId: string;
  conversationId: string;
  items: CreateOrderItem[];
}

/** Por qué no entró un ítem al pedido. Contrato propio de agent. */
export type RejectedOrderItemReason =
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'INVALID_QUANTITY';

export interface RejectedOrderItem {
  productId: string;
  reason: RejectedOrderItemReason;
}

export interface CreateOrderResult {
  /** null cuando ningún ítem fue válido: no se creó ningún pedido. */
  orderId: string | null;
  total: number | null;
  rejectedItems: RejectedOrderItem[];
}

/**
 * Puerto hacia la creación de pedidos. Lo implementa `OrdersOrderAdapter`, que
 * delega en el módulo `orders` (único punto donde agent conoce a orders), o
 * `FakeOrderProvider` en desarrollo (ORDER_PROVIDER=fake|orders).
 *
 * OJO: hoy NADIE invoca este puerto. `ProcessCustomerMessageUseCase` todavía no
 * crea pedidos: para eso el LLM necesita tool-calling (poder pedir "crear
 * pedido" con ítems estructurados), que es una etapa posterior. El puerto y su
 * adapter quedan cableados y probados para ese momento.
 */
export interface OrderPort {
  createOrder(command: CreateOrderCommand): Promise<CreateOrderResult>;
}

export const ORDER_PORT = Symbol('OrderPort');
