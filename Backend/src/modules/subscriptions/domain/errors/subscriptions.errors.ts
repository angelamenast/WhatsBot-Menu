import { formatearFechaColombia } from '../periodo-suscripcion';

export class PlanVencidoError extends Error {
  readonly codigo = 'PLAN_VENCIDO';

  constructor() {
    super('Tu plan venció. Renueva para editar.');
  }
}

export class SinSuscripcionError extends Error {
  readonly codigo = 'SIN_SUSCRIPCION';

  constructor() {
    super('No tienes un plan para renovar');
  }
}

// HU-8.3 criterio 2: el plan aún está vigente y el usuario debe confirmar la renovación anticipada.
export class PlanVigenteConfirmarError extends Error {
  readonly codigo = 'PLAN_VIGENTE_CONFIRMAR';

  constructor(public readonly fechaFin: Date) {
    super(`Tu plan aún está vigente hasta ${formatearFechaColombia(fechaFin)}. ¿Deseas renovarlo de todas formas?`);
  }
}

export class RenovacionNoEncontradaError extends Error {
  readonly codigo = 'RENOVACION_NO_ENCONTRADA';

  constructor() {
    super('No encontramos esa renovación');
  }
}
