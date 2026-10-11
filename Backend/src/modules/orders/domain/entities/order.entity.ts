import { randomUUID } from 'node:crypto';
import { OrderItem } from './order-item.entity';
import {
  EmptyOrderError,
  InvalidOrderTransitionError,
} from '../errors/order.errors';

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export interface OrderProps {
  id: string;
  businessId: string;
  conversationId: string;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

export class Order {
  private constructor(private props: OrderProps) {
    // Copia defensiva: quien construyó el pedido no puede mutar sus items después.
    this.props.items = [...props.items];
  }

  /**
   * Hidrata un pedido ya persistido. Sin validaciones a propósito: puede existir
   * en BD un pedido huérfano sin items (creaciones fallidas anteriores a la RPC
   * atómica) y leerlo no debe romper el listado. Nunca usar para crear pedidos
   * nuevos — para eso está createPending().
   */
  static reconstitute(props: OrderProps): Order {
    return new Order({ ...props });
  }

  /**
   * Crea un pedido en PENDING. El agente lo genera cuando el cliente termina
   * de armar su pedido en la conversación — la confirmación real queda en
   * manos del dueño del negocio desde el dashboard (ver confirm()), nunca es
   * automática. Esto es intencional por seguridad: nada se compromete con el
   * cliente sin que un humano del negocio lo revise primero.
   */
  static createPending(params: {
    businessId: string;
    conversationId: string;
    items: OrderItem[];
  }): Order {
    if (params.items.length === 0) {
      throw new EmptyOrderError();
    }

    const now = new Date();
    return new Order({
      id: randomUUID(),
      businessId: params.businessId,
      conversationId: params.conversationId,
      status: OrderStatus.PENDING,
      items: params.items,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get businessId(): string {
    return this.props.businessId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get items(): readonly OrderItem[] {
    return [...this.props.items];
  }

  get total(): number {
    // Redondeo a 2 decimales (la BD guarda numeric(12,2)): evita colas de punto flotante como 0.30000000000000004.
    const sum = this.props.items.reduce((acc, item) => acc + item.subtotal, 0);
    return Math.round(sum * 100) / 100;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Solo el dueño del negocio confirma, desde el dashboard — nunca el agente
   * ni el cliente final directamente. Solo es válido desde PENDING.
   */
  confirm(): void {
    if (this.props.status !== OrderStatus.PENDING) {
      throw new InvalidOrderTransitionError(
        this.props.status,
        OrderStatus.CONFIRMED,
      );
    }

    this.props.status = OrderStatus.CONFIRMED;
    this.props.updatedAt = new Date();
  }

  /**
   * Solo el dueño del negocio cancela desde el dashboard (nunca el agente).
   * Válido desde PENDING o CONFIRMED. Un pedido CANCELLED es un estado final:
   * no se puede cancelar dos veces, ni cancelar algo ya cancelado.
   */
  cancel(): void {
    if (this.props.status === OrderStatus.CANCELLED) {
      throw new InvalidOrderTransitionError(
        this.props.status,
        OrderStatus.CANCELLED,
      );
    }

    this.props.status = OrderStatus.CANCELLED;
    this.props.updatedAt = new Date();
  }
}
