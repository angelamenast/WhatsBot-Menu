export class CreateNegocioCommand {
  constructor(
    public readonly usuarioId: string,
    public readonly nombreNegocio: string,
    public readonly numeroWhatsapp: string,
    public readonly descripcion?: string,
  ) {}
}