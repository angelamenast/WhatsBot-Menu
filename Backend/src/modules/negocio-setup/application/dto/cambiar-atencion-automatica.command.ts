export class CambiarAtencionAutomaticaCommand {
  constructor(
    public readonly usuarioId: string,
    public readonly activa: boolean,
  ) {}
}
