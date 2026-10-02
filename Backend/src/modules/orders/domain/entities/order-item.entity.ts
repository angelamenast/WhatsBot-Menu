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
    if (props.quantity <= 0) {
      throw new Error('La cantidad de un item debe ser mayor a cero');
    }
    if (props.unitPrice < 0) {
      throw new Error('El precio unitario no puede ser negativo');
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
