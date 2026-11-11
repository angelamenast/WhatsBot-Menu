import {
  InvalidOrderItemPriceError,
  InvalidOrderItemProductError,
  InvalidOrderItemQuantityError,
} from '../errors/order.errors';

/** Tope de unidades de un mismo producto en un pedido (ya fusionados los duplicados). */
export const MAX_ITEM_QUANTITY = 99;

export interface OrderItemProps {
  /**
   * null solo para ítems hidratados desde BD: pedido_items.producto_id es
   * ON DELETE SET NULL, así que borrar un producto del catálogo deja el ítem
   * (con su snapshot) sin referencia. Crear un ítem nuevo exige un id.
   */
  productId: string | null;
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

  static create(props: OrderItemProps & { productId: string }): OrderItem {
    if (typeof props.productId !== 'string' || props.productId.length === 0) {
      throw new InvalidOrderItemProductError();
    }
    if (
      !Number.isInteger(props.quantity) ||
      props.quantity <= 0 ||
      props.quantity > MAX_ITEM_QUANTITY
    ) {
      throw new InvalidOrderItemQuantityError(props.quantity);
    }
    if (!Number.isFinite(props.unitPrice) || props.unitPrice < 0) {
      throw new InvalidOrderItemPriceError(props.unitPrice);
    }
    return new OrderItem({ ...props });
  }

  /**
   * Hidrata un ítem ya persistido. Sin validaciones a propósito: los datos ya
   * existen en BD (quizá creados antes de que existiera el tope de cantidad, o
   * con producto borrado) y leerlos no debe romper el listado. Nunca usar para
   * crear ítems nuevos — para eso está create().
   */
  static reconstitute(props: OrderItemProps): OrderItem {
    return new OrderItem({ ...props });
  }

  get productId(): string | null {
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
