export type EstadoSuscripcion = 'activa' | 'vencida' | 'cancelada' | 'pendiente';

export interface PlanResumen {
  id: string;
  nombre: string;
  precio: number;
}

// Vista de solo lectura de la suscripción que determina el acceso de un negocio.
// La escritura de suscripciones sigue siendo responsabilidad del módulo payments.
export class SuscripcionVigente {
  constructor(
    public readonly id: string,
    public readonly negocioId: string,
    public readonly estado: EstadoSuscripcion,
    public readonly fechaFin: Date | null,
    public readonly plan: PlanResumen | null,
  ) {}
}
