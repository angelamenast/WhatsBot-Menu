export class PlanVencidoError extends Error {
  readonly codigo = 'PLAN_VENCIDO';

  constructor() {
    super('Tu plan venció. Renueva para editar.');
  }
}
