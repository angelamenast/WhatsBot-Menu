// Suscripción que debe recibir una alerta de vencimiento, con los datos que necesita el correo.
export class SuscripcionPorNotificar {
  constructor(
    public readonly suscripcionId: string,
    public readonly negocioId: string,
    public readonly usuarioId: string,
    public readonly nombreNegocio: string,
    public readonly nombrePlan: string,
    public readonly fechaFin: Date,
  ) {}
}
