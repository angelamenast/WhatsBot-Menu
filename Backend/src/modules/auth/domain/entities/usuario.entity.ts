export class Usuario {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly telefono: string | null,
  ) {}
}