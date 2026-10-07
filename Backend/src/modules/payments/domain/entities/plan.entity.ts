export class Plan {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly precio: number,
    public readonly limiteMensajes: number | null,
    public readonly limiteTokens: number | null,
  ) {}
}