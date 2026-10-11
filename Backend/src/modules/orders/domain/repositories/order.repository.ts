import { Order, OrderStatus } from '../entities/order.entity';

export interface OrderRepository {
  /** Filtra por negocio en la propia consulta: un pedido ajeno es indistinguible de uno inexistente. */
  findById(orderId: string, businessId: string): Promise<Order | null>;
  findAllByBusinessId(businessId: string): Promise<Order[]>;
  /** Persiste un pedido nuevo (cabecera + items) de forma atómica. */
  insert(order: Order): Promise<void>;
  /**
   * Cambia el estado solo si la fila sigue en `expectedStatus` (compare-and-set).
   * Devuelve false si nadie coincidió — otro proceso ya lo cambió o no es del negocio.
   */
  updateStatus(
    orderId: string,
    businessId: string,
    expectedStatus: OrderStatus,
    newStatus: OrderStatus,
    updatedAt: Date,
  ): Promise<boolean>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
