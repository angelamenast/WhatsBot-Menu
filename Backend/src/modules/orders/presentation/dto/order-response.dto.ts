import { Order } from '../../domain/entities/order.entity';
import type {
  OrderPage,
  OrderView,
} from '../../domain/repositories/order.repository';

export interface OrderItemResponse {
  /** null si el producto fue eliminado del catálogo; el snapshot de nombre y precio se conserva. */
  productId: string | null;
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

/** Respuesta de lectura (GET): incluye el teléfono del cliente. */
export interface OrderDetailResponse extends OrderResponse {
  customerPhone: string;
}

export interface OrderListResponse {
  data: OrderDetailResponse[];
  total: number;
  limit: number;
  offset: number;
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

export function toOrderDetailResponse(view: OrderView): OrderDetailResponse {
  return { ...toOrderResponse(view.order), customerPhone: view.customerPhone };
}

export function toOrderListResponse(
  page: OrderPage,
  limit: number,
  offset: number,
): OrderListResponse {
  return {
    data: page.items.map(toOrderDetailResponse),
    total: page.total,
    limit,
    offset,
  };
}
