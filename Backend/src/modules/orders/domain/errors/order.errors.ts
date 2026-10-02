export class EmptyOrderError extends Error {
  constructor() {
    super('No se puede crear un pedido sin items');
    this.name = 'EmptyOrderError';
  }
}

export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`El producto ${productId} no existe en el catálogo del negocio`);
    this.name = 'ProductNotFoundError';
  }
}

export class ProductUnavailableError extends Error {
  constructor(productId: string) {
    super(`El producto ${productId} no está disponible actualmente`);
    this.name = 'ProductUnavailableError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`No existe un pedido con id ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}

export class InvalidOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`No se puede cambiar un pedido de estado "${from}" a "${to}"`);
    this.name = 'InvalidOrderTransitionError';
  }
}
