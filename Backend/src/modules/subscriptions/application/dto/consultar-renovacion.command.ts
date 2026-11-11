export class ConsultarRenovacionCommand {
  constructor(
    public readonly usuarioId: string,
    public readonly referencia: string,
  ) {}
}
