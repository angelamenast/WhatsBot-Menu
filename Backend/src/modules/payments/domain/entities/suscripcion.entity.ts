export type EstadoSuscripcion = 'activa' | 'vencida' | 'cancelada' | 'pendiente';

export class Suscripcion {
  constructor(
    public readonly id: string,
    public readonly negocioId: string,
    public readonly planId: string,
    public readonly estado: EstadoSuscripcion,
    public readonly fechaInicio: Date | null,
    public readonly fechaFin: Date | null,
  ) {}
}