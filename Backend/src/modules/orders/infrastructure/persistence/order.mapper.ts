import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';

type EstadoPedido = 'pendiente' | 'confirmado' | 'cancelado';

const ESTADO_TO_STATUS: Record<EstadoPedido, OrderStatus> = {
  pendiente: OrderStatus.PENDING,
  confirmado: OrderStatus.CONFIRMED,
  cancelado: OrderStatus.CANCELLED,
};

const STATUS_TO_ESTADO: Record<OrderStatus, EstadoPedido> = {
  [OrderStatus.PENDING]: 'pendiente',
  [OrderStatus.CONFIRMED]: 'confirmado',
  [OrderStatus.CANCELLED]: 'cancelado',
};

interface PedidoItemRow {
  producto_id: string;
  nombre_producto_snapshot: string;
  precio_unitario: number;
  cantidad: number;
}

interface PedidoRow {
  id: string;
  negocio_id: string;
  conversacion_id: string;
  estado_codigo: EstadoPedido;
  created_at: string;
  updated_at: string;
  pedido_items: PedidoItemRow[];
}

export class OrderMapper {
  static toDomain(row: PedidoRow): Order {
    const items = row.pedido_items.map((item) =>
      OrderItem.create({
        productId: item.producto_id,
        productNameSnapshot: item.nombre_producto_snapshot,
        unitPrice: item.precio_unitario,
        quantity: item.cantidad,
      }),
    );

    return Order.create({
      id: row.id,
      businessId: row.negocio_id,
      conversationId: row.conversacion_id,
      status: ESTADO_TO_STATUS[row.estado_codigo],
      items,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPedidoRow(order: Order) {
    return {
      id: order.id,
      negocio_id: order.businessId,
      conversacion_id: order.conversationId,
      estado_codigo: STATUS_TO_ESTADO[order.status],
      total: order.total,
      updated_at: order.updatedAt.toISOString(),
    };
  }

  static toPedidoItemRows(order: Order) {
    return order.items.map((item) => ({
      pedido_id: order.id,
      producto_id: item.productId,
      nombre_producto_snapshot: item.productNameSnapshot,
      precio_unitario: item.unitPrice,
      cantidad: item.quantity,
    }));
  }
}
