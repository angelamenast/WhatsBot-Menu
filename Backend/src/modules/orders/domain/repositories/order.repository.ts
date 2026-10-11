import { Order, OrderStatus } from '../entities/order.entity';

/** Pedido + datos de lectura que no pertenecen al agregado (read model). */
export interface OrderView {
  readonly order: Order;
  readonly customerPhone: string;
}

export interface OrderListFilter {
  /** Inclusivo. */
  readonly from?: Date;
  /** EXCLUSIVO. */
  readonly to?: Date;
  readonly limit: number;
  readonly offset: number;
}

export interface OrderPage {
  readonly items: readonly OrderView[];
  /** Total de pedidos que cumplen el filtro, sin importar limit/offset. */
  readonly total: number;
}

export interface OrderRepository {
  /** Filtra por negocio en la propia consulta: un pedido ajeno es indistinguible de uno inexistente. */
  findById(orderId: string, businessId: string): Promise<Order | null>;
  findViewById(orderId: string, businessId: string): Promise<OrderView | null>;
  /** Más recientes primero (created_at DESC, id DESC). */
  findViewsByBusiness(
    businessId: string,
    filter: OrderListFilter,
  ): Promise<OrderPage>;
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
