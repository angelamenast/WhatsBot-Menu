export class IniciarRenovacionCommand {
  constructor(
    public readonly usuarioId: string,
    public readonly confirmarRenovacionAnticipada: boolean,
    public readonly redirectUrl: string,
  ) {}
}
