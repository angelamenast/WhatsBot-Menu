// El estado se consulta por usuario (dashboard, guard) o directamente por negocio
// (webhook de WhatsApp, que ya conoce el negocio destinatario).
export class ObtenerEstadoSuscripcionCommand {
  private constructor(
    public readonly usuarioId: string | null,
    public readonly negocioId: string | null,
  ) {}

  static porUsuario(usuarioId: string): ObtenerEstadoSuscripcionCommand {
    return new ObtenerEstadoSuscripcionCommand(usuarioId, null);
  }

  static porNegocio(negocioId: string): ObtenerEstadoSuscripcionCommand {
    return new ObtenerEstadoSuscripcionCommand(null, negocioId);
  }
}
