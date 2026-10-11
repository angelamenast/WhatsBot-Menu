import {
  InvalidOrderItemPriceError,
  InvalidOrderItemQuantityError,
} from '../errors/order.errors';

export interface OrderItemProps {
  productId: string;
  productNameSnapshot: string;
  unitPrice: number;
  quantity: number;
}

/**
 * No es una entidad con identidad propia (no tiene su propio ciclo de vida fuera
 * de Order) — es un value object: se compara por valor, no por id. Vive siempre
 * dentro de un Order. productNameSnapshot y unitPrice se congelan en el momento
 * de crear el pedido — si el precio del producto cambia después en el catálogo,
 * este item no cambia, es historia.
 */
export class OrderItem {
  private constructor(private props: OrderItemProps) {}

  static create(props: OrderItemProps): OrderItem {
    if (!Number.isInteger(props.quantity) || props.quantity <= 0) {
      throw new InvalidOrderItemQuantityError(props.quantity);
    }
    if (!Number.isFinite(props.unitPrice) || props.unitPrice < 0) {
      throw new InvalidOrderItemPriceError(props.unitPrice);
    }
    return new OrderItem(props);
  }

  get productId(): string {
    return this.props.productId;
  }

  get productNameSnapshot(): string {
    return this.props.productNameSnapshot;
  }

  get unitPrice(): number {
    return this.props.unitPrice;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get subtotal(): number {
    return this.unitPrice * this.quantity;
  }
}
