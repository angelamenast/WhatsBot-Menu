import { Order } from '../../domain/entities/order.entity';

export type RejectionReason = 'NOT_FOUND' | 'UNAVAILABLE' | 'INVALID_QUANTITY';

export interface RejectedItem {
  readonly productId: string;
  readonly reason: RejectionReason;
}

export interface CreateOrderResult {
  /** null cuando ningún ítem fue válido: no se crea ni se persiste nada. */
  readonly order: Order | null;
  readonly rejectedItems: readonly RejectedItem[];
}
