import { Order } from '../../domain/entities/order.entity';

export interface OrderItemResponse {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface OrderResponse {
  id: string;
  businessId: string;
  conversationId: string;
  status: string;
  items: OrderItemResponse[];
  total: number;
  createdAt: string;
  updatedAt: string;
}

export function toOrderResponse(order: Order): OrderResponse {
  return {
    id: order.id,
    businessId: order.businessId,
    conversationId: order.conversationId,
    status: order.status,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productNameSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    total: order.total,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
