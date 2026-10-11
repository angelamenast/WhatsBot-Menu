import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { UnknownOrderStatusError } from '../../domain/errors/order.errors';

export type EstadoPedido = 'pendiente' | 'confirmado' | 'cancelado';

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

    return Order.reconstitute({
      id: row.id,
      businessId: row.negocio_id,
      conversationId: row.conversacion_id,
      status: OrderMapper.toStatus(row.estado_codigo),
      items,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toStatus(estadoCodigo: string): OrderStatus {
    // hasOwn: evita que claves heredadas ("constructor", "toString"...) pasen por estado.
    if (!Object.hasOwn(ESTADO_TO_STATUS, estadoCodigo)) {
      throw new UnknownOrderStatusError(estadoCodigo);
    }
    return ESTADO_TO_STATUS[estadoCodigo as EstadoPedido];
  }

  static toEstadoCodigo(status: OrderStatus): EstadoPedido {
    return STATUS_TO_ESTADO[status];
  }

  /**
   * Parámetros de la función SQL crear_pedido. Sin total ni subtotal: la función
   * calcula el total desde los items (y subtotal es una columna generada).
   */
  static toCrearPedidoParams(order: Order) {
    return {
      p_pedido_id: order.id,
      p_negocio_id: order.businessId,
      p_conversacion_id: order.conversationId,
      p_items: order.items.map((item) => ({
        producto_id: item.productId,
        nombre_producto_snapshot: item.productNameSnapshot,
        precio_unitario: item.unitPrice,
        cantidad: item.quantity,
      })),
    };
  }
}
