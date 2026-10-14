export type EstadoTransaccion = 'pendiente' | 'aprobado' | 'rechazado';

export class TransaccionPago {
  constructor(
    public readonly id: string,
    public readonly suscripcionId: string,
    public readonly referenciaWompi: string,
    public readonly monto: number,
    public readonly estado: EstadoTransaccion,
  ) {}
}