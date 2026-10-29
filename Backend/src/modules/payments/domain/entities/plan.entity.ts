export class Plan {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly precio: number,
    public readonly limiteMensajes: number | null,
    public readonly limiteTokens: number | null,
    // Meses de vigencia que da un pago del plan (1 = mensual, 12 = anual).
    public readonly duracionMeses: number = 1,
    public readonly activo: boolean = true,
  ) {}
}
