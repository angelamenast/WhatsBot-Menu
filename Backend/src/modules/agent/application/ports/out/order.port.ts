export interface CreateOrderItem {
  productId: string;
  quantity: number;
}

export interface CreateOrderCommand {
  businessId: string;
  conversationId: string;
  items: CreateOrderItem[];
}

export interface CreateOrderResult {
  orderId: string;
  total: number;
}

/**
 * Puerto hacia la creación de pedidos. Hoy no existe `PedidosModule`, así que la
 * implementación es un adapter provisional de este módulo escribiendo directo a
 * `pedidos`/`pedido_items`. El caso de uso del agente nunca sabe esto: cuando el
 * equipo levante `PedidosModule`, solo se reemplaza el adapter.
 */
export interface OrderPort {
  createOrder(command: CreateOrderCommand): Promise<CreateOrderResult>;
}

export const ORDER_PORT = Symbol('OrderPort');