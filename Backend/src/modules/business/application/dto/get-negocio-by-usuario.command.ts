export class GetNegocioByUsuarioCommand {
  constructor(
    public readonly usuarioId: string,
  ) {}
}