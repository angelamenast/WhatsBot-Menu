export class Negocio {
  constructor(
    public readonly id: string,
    public readonly usuarioId: string,
    public readonly nombreNegocio: string,
    public readonly numeroWhatsapp: string,
    public readonly estado: 'activo' | 'inactivo' | 'suspendido',
    public readonly descripcion: string | null,
  ) {}
}