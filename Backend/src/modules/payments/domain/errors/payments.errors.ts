export class PlanNoEncontradoError extends Error {
  constructor() {
    super('Plan no encontrado');
  }
}

export class SuscripcionNoEncontradaError extends Error {
  constructor() {
    super('Suscripción no encontrada');
  }
}

export class TransaccionNoEncontradaError extends Error {
  constructor() {
    super('Transacción no encontrada');
  }
}

export class FirmaWebhookInvalidaError extends Error {
  constructor() {
    super('Firma de webhook inválida');
  }
}