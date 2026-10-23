export interface CreateOrderItem {
  productId: string;
  quantity: number;
}

/** Nunca lleva precios ni totales: el backend los lee del catálogo al crear el pedido. */
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

/** Ítem que SÍ entró al pedido, con el nombre y el precio reales del catálogo en ese momento. */
export interface AcceptedOrderItem {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderCreated {
  kind: 'CREATED';
  orderId: string;
  total: number;
  items: AcceptedOrderItem[];
  rejectedItems: RejectedOrderItem[];
}

/** Ningún ítem fue válido: no se creó ningún pedido. */
export interface OrderNotCreatedNoValidItems {
  kind: 'NO_VALID_ITEMS';
  rejectedItems: RejectedOrderItem[];
}

/** La conversación ya tiene un pedido abierto (no cancelado): `orderId` es el de ese pedido. */
export interface OrderConversationAlreadyHasOrder {
  kind: 'CONVERSATION_ALREADY_HAS_ORDER';
  orderId: string;
}

export type CreateOrderResult =
  | OrderCreated
  | OrderNotCreatedNoValidItems
  | OrderConversationAlreadyHasOrder;

/**
 * Puerto hacia la creación de pedidos. Lo implementa `OrdersOrderAdapter`, que
 * delega en el módulo `orders` (único punto donde agent conoce a orders), o
 * `FakeOrderProvider` en desarrollo (ORDER_PROVIDER=fake|orders).
 *
 * Los errores que no son de negocio (infraestructura, conversación de otro negocio, etc.) se
 * propagan: decidir qué hacer con ellos es de quien invoque el puerto.
 */
export interface OrderPort {
  createOrder(command: CreateOrderCommand): Promise<CreateOrderResult>;
}

export const ORDER_PORT = Symbol('OrderPort');
