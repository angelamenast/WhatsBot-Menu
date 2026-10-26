export class CreateNegocioCommand {
  constructor(
    public readonly usuarioId: string,
    public readonly nombreNegocio: string,
    public readonly numeroWhatsapp: string | null = null,
    public readonly descripcion?: string,
  ) {}
}
