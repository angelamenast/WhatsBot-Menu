export class EmptyOrderError extends Error {
  constructor() {
    super('No se puede crear un pedido sin items');
    this.name = 'EmptyOrderError';
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

export class OrderStateConflictError extends Error {
  constructor(orderId: string) {
    super(
      `El pedido ${orderId} cambió de estado mientras se procesaba la solicitud; vuelve a consultarlo e inténtalo de nuevo`,
    );
    this.name = 'OrderStateConflictError';
  }
}

export class InvalidOrderItemQuantityError extends Error {
  constructor(quantity: number) {
    super(
      `La cantidad de un item debe ser un entero mayor a cero y no superar el máximo permitido (recibido: ${quantity})`,
    );
    this.name = 'InvalidOrderItemQuantityError';
  }
}

export class InvalidOrderItemPriceError extends Error {
  constructor(unitPrice: number) {
    super(
      `El precio unitario debe ser un número finito mayor o igual a cero (recibido: ${unitPrice})`,
    );
    this.name = 'InvalidOrderItemPriceError';
  }
}

export class UnknownOrderStatusError extends Error {
  constructor(estadoCodigo: string) {
    super(`El estado de pedido "${estadoCodigo}" no es reconocido`);
    this.name = 'UnknownOrderStatusError';
  }
}

export class ConversationNotInBusinessError extends Error {
  constructor(conversationId: string, businessId: string) {
    super(
      `La conversación ${conversationId} no pertenece al negocio ${businessId}`,
    );
    this.name = 'ConversationNotInBusinessError';
  }
}

export class InvalidOrderItemProductError extends Error {
  constructor() {
    super('Un item nuevo necesita el id del producto');
    this.name = 'InvalidOrderItemProductError';
  }
}

export class InvalidOrderListFilterError extends Error {
  constructor(reason: string) {
    super(`Filtro de listado inválido: ${reason}`);
    this.name = 'InvalidOrderListFilterError';
  }
}

export class OrderCustomerPhoneMissingError extends Error {
  constructor(orderId: string) {
    super(
      `El pedido ${orderId} no tiene número de cliente asociado en su conversación`,
    );
    this.name = 'OrderCustomerPhoneMissingError';
  }
}
